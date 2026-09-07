# FANO Dental Clinic — Emergency Downtime Operating Procedure (SOP)

**Document Reference**: SOP-OPS-009  
**Version**: 1.0  
**Effective Date**: September 2026  
**Asset Category**: System Availability & Clinical Continuity  
**Classification**: Clinic Standard Operating Procedure (SOP)  

---

## 1. Purpose & Scope
This Standard Operating Procedure defines the fallback steps to maintain uninterrupted clinical, scheduling, and billing operations at **Fano Dental Clinic** during internet disruptions, cloud database latency, or complete server downtime.

---

## 2. Emergency Contacts & Communication Channels

| Contact Person / Desk | Channel | Number / Address |
| :--- | :--- | :--- |
| **Clinic Landline (Main)** | Telephone | **(032) 489-1200** |
| **Clinic Emergency Mobile** | Cellular / SMS | **+63 917 123 4567** |
| **Clinic Reception Desk** | Physical | Balirong Highway, City of Naga, Cebu |
| **System Health Check URL** | Web / HTTP | `https://[clinic-domain]/api/health` |
| **IT & Infrastructure Lead** | Internal | `admin@fanoclinic.com` |

---

## 3. Incident Severity Levels

- **Level 1 — Transient Glitch (< 5 minutes)**: Brief network lag. Keep tabs open; do not re-submit forms repeatedly.
- **Level 2 — Offline Network Disruption (5–60 minutes)**: Client browser displays top offline banner. Switch to local manual protocol.
- **Level 3 — Extended Cloud / Database Outage (> 1 hour)**: Full activation of Physical Downtime Logbooks and manual receipt issuance.

---

## 4. Operational Fallback Protocol (Step-by-Step)

### Phase 1: Outage Detection & Verification
1. Verify system status via the public health endpoint: `GET /api/health`.
   - If response returns `status: degraded` or `database: disconnected`, notify the Clinic Administrator.
2. Check local clinic router / ISP fiber line:
   - Verify Ethernet and Wi-Fi lights on the clinic gateway router.
   - Switch clinic reception workstation to backup 4G/5G mobile hotspot if primary fiber line is severed.

### Phase 2: Patient Front-Desk & Scheduling Protocol
1. **Physical Logbook Activation**:
   - The receptionist retrieves the **Physical Appointment & Patient Registry (Binder 1)** located in the front desk filing drawer.
   - Record walk-in and arriving patients manually:
     - Date & Timestamp
     - Full Name
     - Contact Number
     - Attending Dentist & Treatment Procedure
2. **Existing Bookings Verification**:
   - Use the pre-printed **Daily Patient Schedule Sheet** (printed every morning at 7:30 AM before clinic opening).
   - If patient shows booking confirmation on their mobile phone (SMS or Email with 6-digit reference), accept the reservation as verified.

### Phase 3: Offline Billing & Cash Receipts Protocol
1. **Physical Official Receipt (OR) Booklet**:
   - In accordance with Philippine tax and BIR compliance, receptionist/accounting shall issue pre-printed manual Official Receipts.
   - Record:
     - Patient Name
     - Services Rendered
     - Cash Amount Tendered
     - Receptionist Signature
2. **No Cash Write-Offs During Downtime**:
   - In accordance with Separation of Duties, receptionists **shall not** alter invoice values, waive fees, or declare debt write-offs offline.
   - Any payment anomalies or adjustments must wait until cloud ledger connection is re-established and approved by Accounting.

### Phase 4: Emergency Patient Handling
1. Patients experiencing acute dental emergencies (severe pain, facial trauma, hemorrhage) are admitted immediately to operatory care without waiting for digital verification.
2. Dentists record paper clinical notes in the temporary paper patient chart.

---

## 5. Post-Outage Data Reconciliation & Recovery
Once `/api/health` indicates `status: healthy` and internet connectivity is restored:

1. **Digital Data Entry**:
   - Reception staff transcribes all manual paper log entries into the portal within **2 hours** of restoration.
2. **Financial Ledger Reconciliation**:
   - Accounting staff runs the **Automated Financial Reconciliation** tool from the Accounting Dashboard (`/pages/accounting-dashboard.html` -> *Run Reconciliation* or `GET /api/invoices/reconciliation`).
   - Reconcile physical cash drawer totals against system recorded payments.
3. **Audit Log Inspection**:
   - Admin reviews `GET /api/audit-logs` to confirm no duplicate entries were created.
4. **Cloud Backup Trigger**:
   - Admin triggers an immediate manual snapshot from Admin Console (`POST /api/admin/trigger-backup`) to record the newly entered post-outage state.
