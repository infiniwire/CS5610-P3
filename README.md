# PaperPulse — Discover and Track University Research

PaperPulse is a full-stack web application that helps students and researchers discover, organize, and track academic research papers published in 2026 by universities in the United States and Canada.

Users can search for research papers, explore university rankings, save papers to personal reading lists, and follow research categories to stay updated on recent publications.

## 1. Authors

- **Sheng Qin** — Paper Discovery, Saved Papers, Authentication, and Research Analytics
- **Tian Yuan** — Research Category Tracker, Followed Topics CRUD, Recent Papers Dashboard, and University Comparison

**Course:** CS 5610 — Web Development  
**University:** Northeastern University

## 2. Project Objective

The goal of PaperPulse is to provide a centralized platform for exploring and managing university research publications.

The application addresses three main challenges:

- **Research Discovery:** Finding relevant papers across universities, authors, research categories, and publication dates.
- **Research Organization:** Saving interesting papers, maintaining reading notes, and tracking reading progress.
- **Research Monitoring:** Following research categories, discovering newly published papers, and comparing research activity across universities.

PaperPulse focuses on research papers published in 2026 with institutional affiliations in the United States or Canada.

## 3. Key Features

### 3.1 Paper Discovery

- Browse research papers imported from OpenAlex.
- Search papers by title, author, and research category.
- Filter publications by university and publication month.
- Sort papers by cumulative citation count.
- View paper details and publication metadata.

### 3.2 Saved Papers

Authenticated users can manage their personal research reading lists.

- Save papers to a personal collection.
- View saved papers.
- Add and update reading notes.
- Track reading status: Unread, Reading, or Read.
- Remove papers from the saved collection.

### 3.3 Research Category Tracker

Users can follow research topics and monitor publication activity.

- Search and discover research categories.
- Follow selected research categories.
- View and manage followed categories.
- Update or remove followed topics.
- Track when each category was last checked.

### 3.4 Recent Papers Dashboard

- View recently published papers in followed research categories.
- Monitor publication updates for topics of interest.
- Access relevant papers directly from the dashboard.

### 3.5 University Comparison

- Compare universities by the number of papers published.
- Filter comparisons by research category and publication month.
- Explore research activity across institutions.

### 3.6 Research Analytics and Rankings

- Explore publication statistics and research trends.
- View rankings of papers, universities, authors, and research topics.
- Analyze citation distributions and publication activity.

### 3.7 User Authentication

- Register a user account.
- Log in and log out.
- Maintain authenticated sessions using Passport.js.
- Keep saved papers and followed topics associated with individual users.

## 4. Technology Stack

| Layer             | Technologies                                |
| ----------------- | ------------------------------------------- |
| Frontend          | React, React Hooks, JavaScript, HTML5, CSS3 |
| Backend           | Node.js, Express.js                         |
| Database          | MongoDB (Native Node.js Driver)             |
| Authentication    | Passport.js, Express Session                |
| API Communication | Fetch API                                   |
| Research Data     | OpenAlex                                    |
| Testing           | Node.js Test Runner                         |
| Code Quality      | ESLint, Prettier                            |
| Deployment        | Railway                                     |

The application uses client-side rendering with React and communicates with the Express backend through RESTful APIs.

## 5. Project Structure

```text
CS5610-P3/
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── auth.js
│   ├── papers.js
│   ├── saved-papers.js
│   ├── followed-topics.js
│   ├── topics.js
│   ├── topic-input.js
│   ├── rankings.js
│   ├── analysis.js
│   ├── import-openalex.js
│   └── package.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── MyTopicsPage.jsx
│   │   ├── TopicSearch.jsx
│   │   ├── FollowedTopicEntry.jsx
│   │   ├── RecentTopicPapers.jsx
│   │   ├── TopicUniversityComparison.jsx
│   │   └── topicRequest.js
│   └── package.json
│
├── Doc/
│   ├── design-document.md
│   └── design-mockups/
│       ├── login.png
│       ├── papers.png
│       ├── details.png
│       ├── saved.png
│       ├── my-topics.png
│       └── rankings.png
│
├── .env
├── .gitignore
├── eslint.config.mjs
├── package.json
└── README.md
```

## 6. Installation and Setup

### Prerequisites

Before running the application, ensure that the following are available:

- Node.js and npm
- MongoDB database connection
- Git
- OpenAlex API key (required for importing research data)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd CS5610-P3
```

### Step 2: Install Dependencies

Install the backend dependencies:

```bash
cd backend
npm install
```

Install the frontend dependencies:

```bash
cd ../frontend
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root directory.

```env
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_secure_session_secret
OPENALEX_API_KEY=your_openalex_api_key
```

The session secret must contain at least 32 bytes.

**Security:** Never commit the `.env` file or any real credentials to GitHub.

### Step 4: Build the Frontend

From the frontend directory:

```bash
npm run build
```

This generates the production-ready React application in `frontend/dist/`.

### Step 5: Start the Backend

```bash
cd ../backend
npm run dev
```

The Express server runs on port 3000 by default.

### Step 6: Open the Application

Visit:

**http://localhost:3000**

The backend serves the compiled React frontend and provides the REST API endpoints.

## 7. Database

PaperPulse uses MongoDB to store research data and user-specific information.

Major collections include:

| Collection                 | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `papers`                   | Research publications and metadata               |
| `users`                    | Registered user accounts                         |
| `savedPapers`              | User reading lists, notes, and reading status    |
| Followed topics collection | User research interests and tracking information |
| `appCache`                 | Cached research statistics and rankings          |

Research publication metadata is imported from OpenAlex.

The application uses the native MongoDB Node.js driver rather than Mongoose.

## 8. Testing and Code Quality

The project includes automated tests for backend functionality and selected frontend utilities.

Test files cover:

- Paper search and query validation.
- Saved paper CRUD and user isolation.
- Followed topic functionality.
- Research topic queries.
- Rankings and analytics.
- Dataset summary and caching.
- Frontend topic request utilities.

The project uses ESLint for code quality and Prettier for consistent formatting.

## 9. Design Documentation

The project design document includes:

- Project description
- User personas
- User stories
- Design mockups

See [Design Document](Doc/design-document.md).

### Design Mockups

**Paper Discovery**

![Paper Discovery](Doc/design-mockups/papers.png)

**Paper Details**

![Paper Details](Doc/design-mockups/details.png)

**Saved Papers**

![Saved Papers](Doc/design-mockups/saved.png)

**Research Category Tracker**

![Research Category Tracker](Doc/design-mockups/my-topics.png)

**Research Rankings**

![Research Rankings](Doc/design-mockups/rankings.png)

**Login**

![Login](Doc/design-mockups/login.png)

## 10. Deployment

**Live Application:** [Add deployed website URL]

**Demo Video:** [Add public narrated demonstration URL]

The application is designed to be deployed on Railway, with Express serving the React production build and MongoDB providing persistent data storage.

## 11. License

MIT License — see `LICENSE` for details once the license file is added.

## 12. Acknowledgments

- **OpenAlex** — Research publication metadata.
- **Northeastern University CS 5610** — Course project guidance.
