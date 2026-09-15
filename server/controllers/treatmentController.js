const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');

const IMAGES_JSON_PATH = path.join(__dirname, '../data/treatment_images.json');
const METADATA_JSON_PATH = path.join(__dirname, '../data/treatment_metadata.json');
const SERVICES_UPLOAD_DIR = path.join(__dirname, '../../Resources/services');

function readTreatmentImages() {
  try {
    if (!fs.existsSync(IMAGES_JSON_PATH)) return {};
    const raw = fs.readFileSync(IMAGES_JSON_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveTreatmentImages(map) {
  try {
    const dir = path.dirname(IMAGES_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(IMAGES_JSON_PATH, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('[TreatmentImages Error]', e.message);
  }
}

function readTreatmentMetadata() {
  try {
    if (!fs.existsSync(METADATA_JSON_PATH)) return {};
    const raw = fs.readFileSync(METADATA_JSON_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveTreatmentMetadata(map) {
  try {
    const dir = path.dirname(METADATA_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METADATA_JSON_PATH, JSON.stringify(map, null, 2), 'utf8');
  } catch (e) {
    console.error('[TreatmentMetadata Error]', e.message);
  }
}

function getDefaultImageForName(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('clean') || n.includes('prophylaxis') || n.includes('scaling')) return '../Resources/services/cleaning.jpg';
  if (n.includes('fill') || n.includes('cavity') || n.includes('composite') || n.includes('restor')) return '../Resources/services/filling.jpg';
  if (n.includes('extract') || n.includes('wisdom') || n.includes('surgery') || n.includes('odontec')) return '../Resources/services/extraction.jpg';
  if (n.includes('root canal') || n.includes('endodontic')) return '../Resources/services/root-canal.jpg';
  if (n.includes('whiten') || n.includes('bleach') || n.includes('cosmetic')) return '../Resources/services/whitening.jpg';
  if (n.includes('implant')) return '../Resources/services/implants.jpg';
  if (n.includes('brace') || n.includes('aligner') || n.includes('ortho')) return '../Resources/services/braces.jpg';
  if (n.includes('crown') || n.includes('bridge') || n.includes('veneer') || n.includes('denture')) return '../Resources/services/crowns.jpg';
  if (n.includes('emerg') || n.includes('urgent') || n.includes('pain') || n.includes('trauma')) return '../Resources/services/emergency.jpg';
  return '../Resources/services/cleaning.jpg';
}

function extractMetadataFromDescription(rawDesc = '') {
  if (!rawDesc) return { cleanDescription: '', meta: {} };
  const match = rawDesc.match(/<!--METADATA:([\s\S]*?)-->/);
  if (match) {
    try {
      const meta = JSON.parse(match[1]);
      const cleanDescription = rawDesc.replace(/<!--METADATA:[\s\S]*?-->/, '').trim();
      return { cleanDescription, meta: meta || {} };
    } catch (_) {}
  }
  return { cleanDescription: rawDesc.trim(), meta: {} };
}

function embedMetadataIntoDescription(cleanDesc = '', meta = {}) {
  const base = (cleanDesc || '').trim();
  const hasMeta = meta && Object.keys(meta).length > 0;
  if (!hasMeta) return base;
  return `${base}\n<!--METADATA:${JSON.stringify(meta)}-->`;
}

// @desc    Get all available treatments (services catalog)
// @route   GET /api/treatments
// @access  Public
const getTreatments = async (req, res) => {
  try {
    const { data: treatments, error } = await supabase
      .from('treatments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const map = readTreatmentImages();
    const metaMap = readTreatmentMetadata();

    const enriched = (treatments || []).map(t => {
      const { cleanDescription, meta: embeddedMeta } = extractMetadataFromDescription(t.description);
      const fileMeta = metaMap[t.id] || {};
      const mergedMeta = { ...fileMeta, ...embeddedMeta };

      const img = mergedMeta.image_url || map[t.id] || getDefaultImageForName(t.name);
      return {
        ...t,
        description: cleanDescription,
        image_url: img,
        category: mergedMeta.category || undefined,
        tagline: mergedMeta.tagline || undefined,
        highlights: mergedMeta.highlights || undefined,
        indications: mergedMeta.indications || undefined,
        steps: mergedMeta.steps || undefined,
        preparation: mergedMeta.preparation || undefined,
        aftercare: mergedMeta.aftercare || undefined
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('[Get Treatments Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add treatment service
// @route   POST /api/treatments
// @access  Private (Admin / Dentist)
const addTreatment = async (req, res) => {
  const {
    name,
    description,
    price,
    duration_minutes,
    durationMinutes,
    is_active,
    image_url,
    category,
    tagline,
    highlights,
    indications,
    steps,
    preparation,
    aftercare
  } = req.body;

  try {
    if (!name) {
      return res.status(400).json({ message: 'Service name is required.' });
    }

    const cleanDesc = (description || 'Professional dental procedure administered by certified specialists.').replace(/<!--METADATA:[\s\S]*?-->/, '').trim();
    const finalImage = image_url || getDefaultImageForName(name);

    const meta = {
      image_url: finalImage,
      category: category || 'General Dentistry',
      tagline: tagline || '',
      highlights: Array.isArray(highlights) ? highlights : [],
      indications: Array.isArray(indications) ? indications : [],
      steps: Array.isArray(steps) ? steps : [],
      preparation: preparation || '',
      aftercare: aftercare || ''
    };

    const combinedDescription = embedMetadataIntoDescription(cleanDesc, meta);

    const { data: treatment, error } = await supabase
      .from('treatments')
      .insert([{
        name: name.trim(),
        description: combinedDescription,
        price: parseFloat(price) || 0,
        duration_minutes: duration_minutes || durationMinutes || 45,
        is_active: is_active !== undefined ? is_active : true
      }])
      .select()
      .single();

    if (error) throw error;

    // Optional sync to local files if writable
    if (!process.env.VERCEL) {
      if (finalImage && treatment.id) {
        const map = readTreatmentImages();
        map[treatment.id] = finalImage;
        saveTreatmentImages(map);
      }
      if (treatment.id) {
        const metaMap = readTreatmentMetadata();
        metaMap[treatment.id] = meta;
        saveTreatmentMetadata(metaMap);
      }
    }

    // Detailed Audit Logging
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const actor = req.user?.name || req.user?.email || 'Admin';
      logAuditAction({
        action: 'TREATMENT_CREATED',
        entityType: 'treatment',
        entityId: treatment.id,
        details: `${actor} added new service: "${treatment.name}" (₱${treatment.price}, ${treatment.duration_minutes}m)`,
        metadata: { treatment_id: treatment.id, name: treatment.name, price: treatment.price },
        req
      });
    } catch (_) {}

    res.status(201).json({
      ...treatment,
      description: cleanDesc,
      image_url: finalImage,
      category: meta.category,
      tagline: meta.tagline,
      highlights: meta.highlights,
      indications: meta.indications,
      steps: meta.steps,
      preparation: meta.preparation,
      aftercare: meta.aftercare
    });
  } catch (error) {
    console.error('[Add Treatment Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update treatment service
// @route   PUT /api/treatments/:id
// @access  Private (Admin / Dentist)
const updateTreatment = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    price,
    duration_minutes,
    durationMinutes,
    is_active,
    image_url,
    category,
    tagline,
    highlights,
    indications,
    steps,
    preparation,
    aftercare
  } = req.body;

  try {
    // Fetch existing treatment to merge metadata
    const { data: existing, error: fetchErr } = await supabase
      .from('treatments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ message: 'Treatment not found.' });

    const { cleanDescription: oldCleanDesc, meta: existingMeta } = extractMetadataFromDescription(existing.description);

    const updatedCleanDesc = description !== undefined
      ? description.replace(/<!--METADATA:[\s\S]*?-->/, '').trim()
      : oldCleanDesc;

    const finalImage = image_url !== undefined ? image_url : (existingMeta.image_url || getDefaultImageForName(name || existing.name));

    const updatedMeta = {
      ...existingMeta,
      image_url: finalImage,
      ...(category !== undefined && { category }),
      ...(tagline !== undefined && { tagline }),
      ...(highlights !== undefined && { highlights }),
      ...(indications !== undefined && { indications }),
      ...(steps !== undefined && { steps }),
      ...(preparation !== undefined && { preparation }),
      ...(aftercare !== undefined && { aftercare })
    };

    const combinedDescription = embedMetadataIntoDescription(updatedCleanDesc, updatedMeta);

    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name.trim();
    updatePayload.description = combinedDescription;
    if (price !== undefined) updatePayload.price = parseFloat(price) || 0;
    if (duration_minutes !== undefined || durationMinutes !== undefined) {
      updatePayload.duration_minutes = duration_minutes || durationMinutes;
    }
    if (is_active !== undefined) updatePayload.is_active = is_active;

    const { data: updated, error: updateErr } = await supabase
      .from('treatments')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Optional sync to local files if writable
    if (!process.env.VERCEL) {
      if (finalImage) {
        const map = readTreatmentImages();
        map[id] = finalImage;
        saveTreatmentImages(map);
      }
      const metaMap = readTreatmentMetadata();
      metaMap[id] = updatedMeta;
      saveTreatmentMetadata(metaMap);
    }

    // Detailed Audit Logging
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const actor = req.user?.name || req.user?.email || 'Admin';
      logAuditAction({
        action: 'TREATMENT_UPDATED',
        entityType: 'treatment',
        entityId: updated.id,
        details: `${actor} updated service: "${updated.name}" (₱${updated.price}, ${updated.duration_minutes}m)`,
        metadata: { treatment_id: updated.id, name: updated.name, price: updated.price },
        req
      });
    } catch (_) {}

    res.json({
      ...updated,
      description: updatedCleanDesc,
      image_url: finalImage,
      category: updatedMeta.category,
      tagline: updatedMeta.tagline,
      highlights: updatedMeta.highlights,
      indications: updatedMeta.indications,
      steps: updatedMeta.steps,
      preparation: updatedMeta.preparation,
      aftercare: updatedMeta.aftercare
    });
  } catch (error) {
    console.error('[Update Treatment Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upload treatment picture
// @route   POST /api/treatments/upload-image
// @access  Private (Admin / Dentist)
const uploadTreatmentImage = async (req, res) => {
  try {
    const { image, data } = req.body;
    const rawData = image || data;
    if (!rawData) {
      return res.status(400).json({ message: 'No image data provided.' });
    }

    const matches = rawData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    let ext = 'jpg';
    let buffer;
    if (matches && matches.length === 3) {
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(rawData, 'base64');
    }

    // If on Vercel or read-only environment, serve directly as base64 data URI
    if (process.env.VERCEL) {
      const dataUri = rawData.startsWith('data:') ? rawData : `data:image/${ext};base64,${rawData}`;
      return res.json({ success: true, image_url: dataUri, filename: `service_${Date.now()}.${ext}` });
    }

    try {
      if (!fs.existsSync(SERVICES_UPLOAD_DIR)) {
        fs.mkdirSync(SERVICES_UPLOAD_DIR, { recursive: true });
      }

      const safeName = `service_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = path.join(SERVICES_UPLOAD_DIR, safeName);
      fs.writeFileSync(filePath, buffer);

      const relativeUrl = `../Resources/services/${safeName}`;
      return res.json({ success: true, image_url: relativeUrl, filename: safeName });
    } catch (fsErr) {
      console.warn('[Upload FS Warning] Read-only filesystem fallback to data URI:', fsErr.message);
      const dataUri = rawData.startsWith('data:') ? rawData : `data:image/${ext};base64,${rawData}`;
      return res.json({ success: true, image_url: dataUri, filename: `service_${Date.now()}.${ext}` });
    }
  } catch (error) {
    console.error('[Upload Error]', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete treatment service (safe check for appointments)
// @route   DELETE /api/treatments/:id
// @access  Private (Admin / Dentist)
const deleteTreatment = async (req, res) => {
  const { id } = req.params;
  try {
    // Check if appointments reference this treatment
    const { data: existingAppts, error: checkErr } = await supabase
      .from('appointments')
      .select('id')
      .eq('treatment_id', id)
      .limit(1);

    if (existingAppts && existingAppts.length > 0) {
      // Deactivate/archive instead of violating foreign key constraint
      const { data: archivedItem, error: archErr } = await supabase
        .from('treatments')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (archErr) throw archErr;

      try {
        const { logAuditAction } = require('../utils/auditLogger');
        const actor = req.user?.name || req.user?.email || 'Admin';
        logAuditAction({
          action: 'TREATMENT_ARCHIVED',
          entityType: 'treatment',
          entityId: id,
          details: `${actor} archived service "${archivedItem.name}" because it is linked to existing clinic appointments.`,
          req
        });
      } catch (_) {}

      return res.json({
        success: true,
        archived: true,
        message: `Service "${archivedItem.name}" has active appointments on file. It has been deactivated and hidden from the catalog.`
      });
    }

    // No existing appointment references — permanently delete
    const { error } = await supabase
      .from('treatments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (!process.env.VERCEL) {
      const map = readTreatmentImages();
      if (map[id]) {
        delete map[id];
        saveTreatmentImages(map);
      }
      const metaMap = readTreatmentMetadata();
      if (metaMap[id]) {
        delete metaMap[id];
        saveTreatmentMetadata(metaMap);
      }
    }

    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const actor = req.user?.name || req.user?.email || 'Admin';
      logAuditAction({
        action: 'TREATMENT_DELETED',
        entityType: 'treatment',
        entityId: id,
        details: `${actor} permanently deleted service ID ${id}`,
        req
      });
    } catch (_) {}

    res.json({ success: true, message: 'Treatment service deleted successfully.' });
  } catch (error) {
    console.error('[Delete Treatment Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTreatments,
  addTreatment,
  updateTreatment,
  uploadTreatmentImage,
  deleteTreatment
};
