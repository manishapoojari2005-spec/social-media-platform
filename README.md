# Pulse — Modern Social Media Platform

A sleek, modern social media platform built with **Vanilla HTML, CSS & JavaScript** on the frontend, and **Django + SQLite** on the backend.

---

## 🌟 Features Implemented

1. **User Profiles**:
   - Custom display name, handle (`@username`), bio, location, personal website, avatar, and banner image.
   - Live follower and following counts, plus total pulses (posts) count.
   - Profile view showing all pulses published by the user.
   - In-app profile editor with preset avatar picker.

2. **Posts & Comments**:
   - Create pulses with rich text, character countdown, hashtag categorization, and optional high-resolution media attachments.
   - Quick photo presets (Tech, Neon City, Nature, Galaxy, 3D Art) or custom image URLs.
   - Real-time comment threads on every pulse with instant post author identification and deletion options.
   - Authors can delete their own pulses with instant removal from feed.

3. **Like & Follow System**:
   - Instant optimistic like/unlike toggle with animated heart pop and counter update.
   - One-click Follow / Unfollow creators from feed cards, profile headers, or the "Suggested Creators" sidebar widget.
   - "Following" feed filter showing updates exclusively from creators you follow.

4. **1-Click Demo Persona Switcher**:
   - Switch seamlessly between 5 pre-seeded creators (Elena Vance, Alex Rivera, Maya Lin, David Kim, and Dr. Sophia Chen) or register your own new account to test multiplayer social interactions immediately.

5. **Aesthetics & UX**:
   - Obsidian dark mode with glassmorphic cards (`backdrop-filter: blur(16px)`).
   - Plus Jakarta Sans typography, vibrant gradients, and micro-interactions.
   - Instant search across post content, usernames, and `#tags`.
   - Responsive layout for desktop, tablet, and mobile.

---

## 🚀 Running the Platform

1. **Start the Django Server**:
   ```bash
   python manage.py runserver 127.0.0.1:8000
   ```

2. **Open in Browser**:
   Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your web browser.

3. **Sample Accounts (Password: `password123`)**:
   - `@elena_v` — Elena Vance (UI Architect & Creative Technologist)
   - `@alex_dev` — Alex Rivera (Full-stack Systems Hacker)
   - `@maya_design` — Maya Lin (3D & Motion Visualizer)
   - `@dkim_photo` — David Kim (Street & Architectural Photographer)
   - `@sophia_ai` — Dr. Sophia Chen (AI Research Scientist)

---

## 📂 Project Architecture

```
├── manage.py
├── pulse_project/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── social/
│   ├── models.py        # UserProfile, Post, Comment, Like, Follow
│   ├── views.py         # RESTful API endpoints & Single-Page Shell
│   ├── urls.py          # Route mappings
│   └── management/
│       └── commands/
│           └── seed_data.py # Database seeder
├── templates/
│   └── index.html       # Single-Page Application interface
├── static/
│   ├── css/style.css    # Design system, glassmorphism & responsive layout
│   └── js/app.js        # State, REST client, animations & DOM handling
└── test_api.py          # Automated verification test suite
```
