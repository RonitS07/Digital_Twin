# AI Human Twin

An AI-powered digital identity platform that learns from your data and executes real-world tasks.

## Stack
- Backend: FastAPI + LangGraph + ChromaDB + PostgreSQL + Groq
- Frontend: React + Tailwind + Firebase Auth

## Setup

### Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in your .env values
uvicorn main:app --reload

### Frontend
cd frontend
npm install
npm run dev

## Features
- AI chat with intent classification
- Gmail read/send/draft
- Google Calendar scheduling with Meet links
- ChromaDB vector memory per user
- Human-in-the-loop approval flow
- Task history logging
