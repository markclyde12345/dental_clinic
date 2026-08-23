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
          contact_number: contactNumber,
          is_verified: true
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
  await seedUser('Jane', 'Finance', 'finance@fanoclinic.com', 'financepassword123', 'Accounting', '5551234567');
  await seedUser('Sarah', 'Clerk', 'receptionist@fanoclinic.com', 'receptionistpassword123', 'Receptionist', '5557654321');

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
  } catch (error) {
    console.error('❌ Seeder database fill error:', error.message);
  }
};

module.exports = seedUsers;
