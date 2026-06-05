<p align="center">
  <img src="public/compiltlogotrans.png" alt="Compilot Logo" width="250" />
</p>

# Compilot: IR(ME)R Competency Matrix

A secure, web-based Clinical Learning Management System (LMS) and Competency Matrix designed specifically for a Radiotherapy Physics department to track, manage, and audit staff competencies under **IR(ME)R 2017** regulations.

This application replaces legacy Excel workbooks with a dynamic, automated, and strictly auditable web platform. It features seamless integration with **QATrack+** via a REST API to fetch live, verifiable evidence of clinical work.

## 🌟 Features

* **Matrix Dashboard:** A dynamic cross-tab grid mapping staff members against structured clinical tasks.
* **Multi-Section Support:** Manage separate databases/sections (e.g., QA, Planning, Brachytherapy, SABR) seamlessly from one interface.
* **Automated State Engine:** Tracks user progress automatically through a milestone-driven training workflow:
  * **`T` (Training):** Actively working through prerequisites.
  * **`M` (Meets Requirements):** All training milestones completed; ready to request assessment.
  * **`A` (Assessment Due):** Assessor notified for formal clinical sign-off.
  * **`C` (Competent):** Fully authorized to act as an independent Operator.
  * **`X` (Competent to Train):** Authorized as an Assessor to evaluate and sign off others.
* **Milestone Tracking:** Includes document/protocol reading, custom in-app Multiple-Choice Quizzes, and automated QATrack+ API log counts.
* **Immutable Audit Log:** Every action, milestone completion, and final assessor authorization is permanently captured with a server-side timestamp to ensure regulatory compliance.
* **Administrative Command Center:** Web-based UI to manage users, groups, competency categories, prerequisites, custom quizzes, and system backups without touching the code.

## 🛠️ Tech Stack

**Frontend:**
* Vue.js 3 (Progressive JavaScript Framework)
* Tailwind CSS (Utility-first styling)
* Chart.js (Statistical visualization)

**Backend:**
* Node.js & Express
* SQLite3 (Zero-configuration, lightweight relational database)
* JSON Web Tokens (JWT) for secure authentication

## 🚀 Installation & Setup

### Prerequisites
* **Node.js** (v14 or higher recommended)
* **npm** (Node Package Manager)

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/compilot-competency-matrix.git
   cd compilot-competency-matrix
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```
   *The server will automatically generate the required SQLite databases (`shared.db`, `QA.db`, etc.) and seed them with initial data if they don't already exist.*

4. **Access the Application:**
   Open your browser and navigate to:
   ```text
   http://localhost:3001
   ```

### Default Credentials
On a fresh installation, a default Superuser account is created:
* **Username:** `admin`
* **Password:** `woody`

> **Note:** Please change this password or delete this account once you have set up your own administrative users via the Admin Dashboard.

## 🔄 Integrations

### QATrack+
The application is designed to interface with QATrack+ to verify practical clinical experience. A built-in mock endpoint (`/api/qa/testlistinstances/`) is provided out-of-the-box for testing and demonstration purposes.

## 🛡️ Regulatory Compliance (IR(ME)R)

To survive external clinical and regulatory audits, the application enforces the following:
* **The Sign-off Chain of Trust:** Assessors cannot promote a user to `C` or `X` unless the logged-in assessor currently holds an active `X` token for that specific task.
* **Strict Lineage:** All state shifts from `T` to `C` are recorded with exact server timestamps, user IDs, and previous/new state comparisons.

## 🧑‍💻 Contributing

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*Developed by James Burnley*
