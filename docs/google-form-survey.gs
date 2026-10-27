/**
 * Fano Dental Group – Survey Form Builder (Google Apps Script)
 *
 * How to use:
 *  1. Go to https://script.google.com  →  New project
 *  2. Paste this whole file, click Save, then Run ▶ "createFanoSurvey"
 *  3. Allow the permissions. The form links appear in View → Logs (Execution log).
 *  4. Open the form → Customize theme → upload google-form-header.png as the header.
 */
function createFanoSurvey() {
  var form = FormApp.create('Fano Dental Group – Patient Survey');
  form.setDescription(
    'Good day! We are conducting a short survey to improve the appointment and ' +
    'patient experience at Fano Dental Group. Your answers will be kept confidential ' +
    'and used for research purposes only. Thank you!'
  );
  form.setProgressBar(true);

  function mc(title, choices) {
    form.addMultipleChoiceItem()
      .setTitle(title)
      .setChoiceValues(choices)
      .setRequired(true);
  }

  // ── Section 1 ───────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('Section 1 – Respondent Profile');
  mc('Age group', ['17 and below', '18 – 25', '26 – 40', '41 – 59', '60 and above']);
  mc('Which best describes you?', [
    'Patient / Dental clinic client',
    'Dental clinic staff (Dentist, Assistant, Receptionist)',
    'Clinic owner / Administrator'
  ]);

  // ── Section 2 ───────────────────────────────────────────────
  form.addPageBreakItem().setTitle('Section 2 – Current Dental Visit Habits');
  mc('How do you usually book a dental appointment?', [
    'Walk-in (No prior appointment)',
    'Calling / Texting the clinic directly',
    'Through Facebook Messenger or social media',
    'Through an online app or website'
  ]);
  mc('Frequency of visiting a dental clinic', [
    'Rarely (Only when in pain or emergency)',
    'Occasionally (Once or twice a year)',
    'Regularly (Every 3–6 months for check-ups/cleaning)',
    'Frequently (Monthly – braces adjustment or ongoing treatment)'
  ]);
  mc('How long do you usually wait at the clinic before being attended to?', [
    'Less than 15 minutes', '15 – 30 minutes', '30 minutes – 1 hour', 'More than 1 hour'
  ]);
  mc('What is the biggest problem you experience when booking a dental appointment?', [
    'Long waiting time at the clinic',
    "Clinic doesn't reply to calls or messages quickly",
    'Not knowing which schedules or dentists are available',
    'Forgetting my appointment date',
    'No problem at all'
  ]);
  mc('How do you usually pay for your dental services?', [
    'Cash only', 'GCash / Maya (E-wallet)', 'Credit / Debit card', 'HMO / Insurance'
  ]);

  // ── Section 3 ───────────────────────────────────────────────
  form.addPageBreakItem().setTitle('Section 3 – Interest in an Online Dental Clinic System');
  mc('Would you prefer booking your dental appointment online?', [
    'Yes, definitely', "Maybe, if it's easy to use", 'No, I prefer walk-in or calling'
  ]);
  mc('Which feature would be MOST helpful for you?', [
    'Online appointment booking with available time slots',
    'Appointment reminders (Email / SMS)',
    'Viewing my dental records and treatment history',
    'Online payment of bills',
    'AI chatbot for quick questions'
  ]);
  mc('How would you like to receive appointment reminders?', [
    'Email', 'SMS / Text message', 'Both Email and SMS', "I don't need reminders"
  ]);
  mc('How comfortable are you using websites or apps for health services?', [
    'Very comfortable', 'Somewhat comfortable', 'Not comfortable (I need assistance)'
  ]);
  mc('Would you be comfortable with the clinic storing your dental records digitally?', [
    'Yes, as long as it is secure',
    "Not sure, I'd like to know more about data privacy",
    'No, I prefer paper records'
  ]);

  Logger.log('Edit form:  ' + form.getEditUrl());
  Logger.log('Share link: ' + form.getPublishedUrl());
}
