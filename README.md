# 🎓 Edulytics
### Smart Academic Management System

> A modern full-stack academic management platform designed to streamline student, faculty, and administrative operations through a secure, scalable, and user-friendly web application.

---

# 📌 Overview

**Edulytics** is a comprehensive academic management system built using modern web technologies. The application enables educational institutions to efficiently manage students, faculty, courses, attendance, and administrative activities through an intuitive dashboard.

The project follows a **full-stack architecture** with a React-based frontend and an Express.js backend powered by Prisma ORM and PostgreSQL, providing secure authentication, efficient database management, and scalable deployment.

---

# 🎯 Objectives

- Digitize academic administration.
- Simplify student and faculty management.
- Provide secure authentication and authorization.
- Improve academic record management.
- Build a scalable full-stack web application.

---

# ✨ Key Features

- 👨‍🎓 Student Management
- 👨‍🏫 Faculty Management
- 📚 Course & Subject Management
- 📅 Attendance Tracking
- 📝 Academic Record Management
- 🔐 Secure JWT Authentication
- 👤 Role-Based Access Control (RBAC)
- 📊 Interactive Dashboard
- 📱 Responsive User Interface
- ⚡ RESTful API Architecture

---

# 🧠 Technology Stack

## Frontend

- React.js
- Vite
- JavaScript
- HTML5
- CSS3

## Backend

- Node.js
- Express.js
- Prisma ORM

## Database

- PostgreSQL

## Authentication

- JWT (JSON Web Token)
- Secure HTTP Cookies

## Development Tools

- Docker
- npm
- Git
- GitHub

---

# 🏗️ System Architecture

```
                User
                  │
                  ▼
         React + Vite Frontend
                  │
        REST API Requests
                  │
                  ▼
          Express.js Backend
                  │
          Prisma ORM Layer
                  │
                  ▼
          PostgreSQL Database
```

---

# 📂 Project Structure

```
Edulytics/
│
├── client/                 # React Frontend
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/                 # Express Backend
│   ├── prisma/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── utils/
│   └── package.json
│
├── docker-compose.yml
├── README.md
└── ...
```

---

# 🚀 Getting Started

## Prerequisites

Before running the project, ensure you have the following installed:

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (or Docker Desktop)

---

# ⚙️ Installation

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/Edulytics.git

cd Edulytics
```

---

## 2️⃣ Start PostgreSQL (Docker)

```bash
docker compose up -d
```

---

## 3️⃣ Configure the Backend

Navigate to the server directory:

```bash
cd server
```

Create the environment file:

```bash
copy .env.example .env
```

Update the `.env` file with your PostgreSQL database credentials and application configuration.

---

## 4️⃣ Install Backend Dependencies

```bash
npm install
```

Initialize the database:

```bash
npm run db:init
```

---

## 5️⃣ Seed Default Admin (Optional)

```bash
npm run seed
```

This creates an administrator account using the environment variables:

- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

> The seeded administrator is automatically configured with **mustChangePassword = true** for enhanced security.

---

## 6️⃣ Configure the Frontend

Navigate to the client folder:

```bash
cd ../client
```

Create the environment file:

```bash
copy .env.example .env
```

Install frontend dependencies:

```bash
npm install
```

---

## 7️⃣ Start the Frontend

```bash
npm run dev
```

Default URL:

```
http://localhost:5173
```

---

## 8️⃣ Start the Backend

Open another terminal:

```bash
cd server

npm run dev
```

Backend URL:

```
http://localhost:4000
```

Health Check Endpoint:

```
GET /health
```

---

# ☁️ Production Deployment

Before deploying the application:

- Configure a strong `JWT_SECRET`
- Set the correct `CLIENT_ORIGIN`
- Enable:

```env
COOKIE_SECURE=true
```

If the frontend and backend are hosted on different HTTPS domains:

```env
COOKIE_SAME_SITE=none
```

Initialize the production database:

```bash
npm run db:init
```

Build the project:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

---

# 🔐 Security Features

- JWT Authentication
- Password Hashing
- Secure HTTP Cookies
- Protected API Routes
- Role-Based Authorization
- Environment Variable Configuration
- Admin Password Reset Enforcement

---

# 📊 Core Modules

- Student Management
- Faculty Management
- Academic Records
- Course Management
- Authentication System
- User Administration
- Dashboard & Analytics

---

# 💼 Skills Demonstrated

This project showcases practical experience in:

- Full-Stack Web Development
- REST API Development
- Database Design
- Authentication & Authorization
- PostgreSQL
- Prisma ORM
- React Development
- Express.js
- Docker
- Deployment & Environment Configuration

---

# 🔮 Future Enhancements

- 📱 Mobile Application
- 📈 Advanced Analytics Dashboard
- 🔔 Email & SMS Notifications
- 📊 Attendance Reports
- 📅 Timetable Management
- 📂 Document Management
- 💳 Online Fee Management
- 📹 Virtual Classroom Integration
- 🤖 AI-powered Student Performance Analytics

---

# 📄 License

This project is intended for educational and research purposes.

---

# 👨‍💻 Author

## Milan Dhal

**Full Stack Developer | Machine Learning | Data Analytics | Computer Vision**

### GitHub

https://github.com/milandhal

---

⭐ **If you found this project useful, consider giving it a star on GitHub!**
