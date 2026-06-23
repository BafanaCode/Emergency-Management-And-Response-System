# 🚨 Alert24 — Emergency Management and Response System

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Recharts](https://img.shields.io/badge/Recharts-3-22B5BF?style=for-the-badge&logo=react&logoColor=white)
![jsPDF](https://img.shields.io/badge/jsPDF-Reports-red?style=for-the-badge&logo=adobeacrobatreader&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Status](https://img.shields.io/badge/Status-Academic_Project-lightgrey?style=for-the-badge)

A web-based emergency management and response platform built with React and Firebase. Alert24 allows users to log, track, and manage emergency incidents in real time, with live data visualisation via Recharts and automated PDF report generation.

---

## 📋 Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [What I Learned](#what-i-learned)
- [Future Improvements](#future-improvements)

---

## About the Project

Alert24 is an emergency management dashboard designed to streamline how incidents are reported, monitored, and resolved. Built on Firebase Firestore with custom security rules, the system stores incident data in real time and presents it through an interactive dashboard. Recharts powers the data visualisation layer, giving responders a live view of incident trends, while jsPDF and jspdf-autotable allow for structured, downloadable incident reports.

> 🎯 Built to practise real-time database design, data visualisation, and report generation within a React application — using a meaningful, real-world domain.

---

## ✨ Features

- 🚨 Incident logging — report and track emergency incidents with relevant details
- 🔥 Real-time updates — Firebase Firestore syncs data live across the app
- 🔐 Authentication — secure user login and registration via Firebase Auth
- 🛡️ Firestore security rules — custom rules controlling read/write access per user role
- 📊 Live dashboard — Recharts-powered charts showing incident trends and statistics
- 📄 PDF report generation — exportable incident reports using jsPDF and jspdf-autotable
- 📱 Responsive design — mobile-friendly layout built with CSS

---

## 🛠️ Tech Stack

| Category        | Technology                         |
|-----------------|------------------------------------|
| Frontend        | React 19, JavaScript (ES6+), CSS3  |
| Backend/DB      | Firebase (Firestore, Auth)         |
| Security        | Firestore Security Rules           |
| Data Viz        | Recharts 3                         |
| PDF Generation  | jsPDF 4, jspdf-autotable           |
| Testing         | React Testing Library, Jest        |
| Tooling         | Create React App, npm              |

---

## 📁 Project Structure

```
Emergency-Management-And-Response-System/
├── public/
│   └── index.html
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Route-level page components
│   ├── firebase/         # Firebase config and initialisation
│   ├── App.js            # Root component
│   └── index.js          # App entry point
├── firestore.rules        # Firestore database security rules
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/BafanaCode/Emergency-Management-And-Response-System.git
   cd Emergency-Management-And-Response-System
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add Firebase credentials**

   Create a `.env` file in the project root:
   ```env
   REACT_APP_FIREBASE_API_KEY=your_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   ```
   > ⚠️ Never commit your `.env` file — it is already in `.gitignore`.

4. **Start the development server**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📚 What I Learned

- Structuring a React app around a real-time data source (Firebase Firestore)
- Writing Firestore security rules to control data access per user role
- Building a live dashboard with Recharts — connecting chart components to live Firestore data
- Generating structured, table-based PDF documents with jsPDF and jspdf-autotable
- Managing authentication state across a multi-page React app with Firebase Auth
- Thinking through data modelling for an incident tracking system

---

## 🔮 Future Improvements

- [ ] Add role-based access — separate views for incident reporters and responders
- [ ] Implement real-time notifications when a new incident is logged
- [ ] Add map integration to visualise incident locations geographically
- [ ] Build an incident status workflow (open → in progress → resolved)
- [ ] Deploy to Firebase Hosting

---

## 👨‍💻 Author

**Luyanda Nhlapho**
📍 Kimberley, South Africa
🎓 Advanced Diploma in ICT – Sol Plaatje University

[![GitHub](https://img.shields.io/badge/GitHub-BafanaCode-181717?style=flat-square&logo=github)](https://github.com/BafanaCode)
