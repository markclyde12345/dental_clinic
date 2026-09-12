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

// @desc    Get all available treatments (services catalog)
// @route   GET /api/treatments
// @access  Public / Private
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
      const img = map[t.id] || getDefaultImageForName(t.name);
      const meta = metaMap[t.id] || {};
      return {
        ...t,
        image_url: img,
        category: meta.category || undefined,
        tagline: meta.tagline || undefined,
        highlights: meta.highlights || undefined,
        indications: meta.indications || undefined,
        steps: meta.steps || undefined,
        preparation: meta.preparation || undefined,
        aftercare: meta.aftercare || undefined
      };
    });

    res.json(enriched);
  } catch (error) {
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
    const { data: treatment, error } = await supabase
      .from('treatments')
      .insert([{
        name,
        description: description || 'Professional dental procedure administered by certified specialists.',
        price: parseFloat(price) || 0,
        duration_minutes: duration_minutes || durationMinutes || 45,
        is_active: is_active !== undefined ? is_active : true
      }])
      .select()
      .single();

    if (error) throw error;

    if (image_url && treatment.id) {
      const map = readTreatmentImages();
      map[treatment.id] = image_url;
      saveTreatmentImages(map);
    }

    if (treatment.id && (category || tagline || highlights || indications || steps || preparation || aftercare)) {
      const metaMap = readTreatmentMetadata();
      metaMap[treatment.id] = {
        category,
        tagline,
        highlights,
        indications,
        steps,
        preparation,
        aftercare
      };
      saveTreatmentMetadata(metaMap);
    }

    const finalImage = image_url || getDefaultImageForName(treatment.name);
    res.status(201).json({
      ...treatment,
      image_url: finalImage,
      category,
      tagline,
      highlights,
      indications,
      steps,
      preparation,
      aftercare
    });
  } catch (error) {
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
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (price !== undefined) updatePayload.price = parseFloat(price) || 0;
    if (duration_minutes !== undefined || durationMinutes !== undefined) {
      updatePayload.duration_minutes = duration_minutes || durationMinutes;
    }
    if (is_active !== undefined) updatePayload.is_active = is_active;

    const { data: updated, error } = await supabase
      .from('treatments')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!updated) return res.status(404).json({ message: 'Treatment not found.' });

    if (image_url !== undefined) {
      const map = readTreatmentImages();
      map[id] = image_url;
      saveTreatmentImages(map);
    }

    if (category !== undefined || tagline !== undefined || highlights !== undefined || indications !== undefined || steps !== undefined || preparation !== undefined || aftercare !== undefined) {
      const metaMap = readTreatmentMetadata();
      metaMap[id] = {
        ...(metaMap[id] || {}),
        ...(category !== undefined && { category }),
        ...(tagline !== undefined && { tagline }),
        ...(highlights !== undefined && { highlights }),
        ...(indications !== undefined && { indications }),
        ...(steps !== undefined && { steps }),
        ...(preparation !== undefined && { preparation }),
        ...(aftercare !== undefined && { aftercare })
      };
      saveTreatmentMetadata(metaMap);
    }

    const map = readTreatmentImages();
    const metaMap = readTreatmentMetadata();
    const finalImage = map[id] || image_url || getDefaultImageForName(updated.name);
    const meta = metaMap[id] || {};

    res.json({
      ...updated,
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

    if (!fs.existsSync(SERVICES_UPLOAD_DIR)) {
      fs.mkdirSync(SERVICES_UPLOAD_DIR, { recursive: true });
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

    const safeName = `service_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(SERVICES_UPLOAD_DIR, safeName);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `../Resources/services/${safeName}`;
    res.json({ success: true, image_url: relativeUrl, filename: safeName });
  } catch (error) {
    console.error('[Upload Error]', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete treatment service
// @route   DELETE /api/treatments/:id
// @access  Private (Admin / Dentist)
const deleteTreatment = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('treatments')
      .delete()
      .eq('id', id);

    if (error) throw error;

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

    res.json({ success: true, message: 'Treatment service deleted successfully' });
  } catch (error) {
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
