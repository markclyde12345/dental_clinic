const supabase = require('../config/db');
const bcrypt = require('bcryptjs');

const seedUser = async (firstName, lastName, email, rawPassword, role, contactNumber) => {
  try {
    const { data: exists, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      throw checkError;
    }

    if (!exists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(rawPassword, salt);
      const fullName = `${firstName} ${lastName}`.trim();

      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          first_name: firstName,
          last_name: lastName,
          name: fullName,
          email,
          password: hashedPassword,
          role,
          contact_number: contactNumber || '09170000000',
          address: 'Naga City, Camarines Sur',
          otp_code: '000000',
          otp_expires: new Date(Date.now() + 86400000).toISOString(),
          otp_attempts: 0,
          is_verified: true,
          is_active: true
        }]);

      if (insertError) {
        throw insertError;
      }
      console.log(`✅ Seeded default ${role} user: ${email} / ${rawPassword}`);
    }
  } catch (error) {
    console.error(`❌ Error seeding user ${email}:`, error.message);
  }
};

const seedUsers = async () => {
  // First seed user roles
  await seedUser('Fano', 'Admin', 'admin@fanoclinic.com', 'adminpassword123', 'Admin', '1234567890');
  await seedUser('Dr. John', 'Doe', 'dentist@fanoclinic.com', 'dentistpassword123', 'Dentist', '0987654321');
  await seedUser('Dr. Angela', 'Tan', 'angela.tan@fanoclinic.com', 'dentistpassword123', 'Dentist', '09191234567');
  await seedUser('Dr. Michael', 'Cruz', 'michael.cruz@fanoclinic.com', 'dentistpassword123', 'Dentist', '09182345678');
  await seedUser('Dr. Marie', 'Santos', 'marie.santos@fanoclinic.com', 'dentistpassword123', 'Dentist', '09173456789');
  await seedUser('Dr. Robert', 'Lim', 'robert.lim@fanoclinic.com', 'dentistpassword123', 'Dentist', '09164567890');
  await seedUser('Jane', 'Finance', 'finance@fanoclinic.com', 'financepassword123', 'Accounting', '5551234567');
  await seedUser('Jane', 'Accounting', 'accounting@fanoclinic.com', 'accountingpassword123', 'Accounting', '5551234568');
  await seedUser('Sarah', 'Clerk', 'receptionist@fanoclinic.com', 'receptionistpassword123', 'Receptionist', '5557654321');
  await seedUser('Demo', 'Patient', 'patient@fanoclinic.com', 'patientpassword123', 'Patient', '5551234569');

  try {
    // 1. Seed Treatments if empty
    const { data: currentTreatments, error: treatError } = await supabase
      .from('treatments')
      .select('id');

    let treatments = [];
    if (!treatError && (!currentTreatments || currentTreatments.length === 0)) {
      const sampleTreatments = [
        { name: 'Teeth Cleaning & Scaling', price: 80, duration_minutes: 45 },
        { name: 'Deep Cavity Filling', price: 150, duration_minutes: 60 },
        { name: 'Wisdom Tooth Extraction', price: 350, duration_minutes: 90 },
        { name: 'Root Canal Therapy', price: 600, duration_minutes: 120 },
        { name: 'Laser Teeth Whitening', price: 250, duration_minutes: 60 }
      ];
      const { data: inserted, error: insertError } = await supabase
        .from('treatments')
        .insert(sampleTreatments)
        .select();
      
      if (insertError) throw insertError;
      treatments = inserted || [];
      console.log('✅ Seeded 5 treatments.');
    } else {
      const { data: allT } = await supabase.from('treatments').select('*');
      treatments = allT || [];
    }

    // 2. Fetch the Patient "mark clyde Castillote" (user ID)
    const { data: patientUser, error: patUserError } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'markycastillote@gmail.com')
      .maybeSingle();

    if (patientUser) {
      // 3. Seed Patient Profile if not exists
      const { data: profileExists } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('user_id', patientUser.id)
        .maybeSingle();

      if (!profileExists) {
        const { error: profileError } = await supabase
          .from('patient_profiles')
          .insert([{
            user_id: patientUser.id,
            date_of_birth: '1995-05-15',
            gender: 'Male',
            blood_type: 'O+',
            allergies: ['Penicillin'],
            medical_notes: 'Patient suffers from tooth sensitivity in lower molar region.'
          }]);
        if (profileError) throw profileError;
        console.log('✅ Seeded patient profile for markycastillote@gmail.com.');
      }

      // Appointments are intentionally preserved across restarts.
      // To reset manually, delete rows in Supabase or run a separate script.
    }

    // 4. Seed Dentists table if present and empty
    const { data: currDentists, error: dentErr } = await supabase.from('dentists').select('id');
    if (!dentErr && (!currDentists || currDentists.length === 0)) {
      const { data: dentistUsers } = await supabase.from('users').select('id, name').eq('role', 'Dentist');
      const specs = ['General Dentistry & Prophylaxis', 'Orthodontics & Braces', 'Oral & Maxillofacial Surgery', 'Endodontics & Root Canal', 'Prosthodontics & Cosmetic Dentistry'];
      const rooms = ['Chair 1 (Main Wing)', 'Chair 2 (Ortho Suite)', 'Surgical Room A', 'Chair 3 (Endo Suite)', 'Chair 4 (Cosmetic Wing)'];
      if (dentistUsers && dentistUsers.length > 0) {
        const rows = dentistUsers.map((du, i) => ({
          user_id: du.id,
          name: du.name,
          specialization: specs[i % specs.length],
          license_no: `PRC-DMD-00482${i + 1}`,
          room_assigned: rooms[i % rooms.length],
          availability: 'On Duty'
        }));
        await supabase.from('dentists').insert(rows);
        console.log(`✅ Seeded ${rows.length} dentists into dentists table.`);
      }
    }

    // 5. Seed Accountancy table if present and empty
    const { data: currAcc, error: accErr } = await supabase.from('accountancy').select('id');
    if (!accErr && (!currAcc || currAcc.length === 0)) {
      const { data: accUsers } = await supabase.from('users').select('id').eq('role', 'Accounting').limit(1);
      const { data: invs } = await supabase.from('invoices').select('id, amount').limit(3);
      const { data: exps } = await supabase.from('expenses').select('id, amount, payment_method').limit(3);
      const accUserId = accUsers?.[0]?.id;
      if (accUserId && invs?.length && exps?.length) {
        const ledgerRows = invs.map((inv, idx) => ({
          user_id: accUserId,
          invoice_id: inv.id,
          expense_id: exps[idx % exps.length].id,
          transaction_type: 'Income',
          amount: inv.amount || 1500,
          payment_method: exps[idx % exps.length].payment_method || 'GCash / Bank Transfer',
          status: 'Completed'
        }));
        await supabase.from('accountancy').insert(ledgerRows);
        console.log(`✅ Seeded ${ledgerRows.length} records into accountancy table.`);
      }
    }
  } catch (error) {
    console.error('❌ Seeder database fill error:', error.message);
  }
};

module.exports = seedUsers;
