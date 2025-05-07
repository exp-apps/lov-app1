# Excel to JSONL Conversion Server

This server provides an API for converting Excel (.xlsx) files to JSONL format with English translation capability.

## Features

- Excel to JSONL conversion
- Automatic translation of non-English text to English (using Google Translate API)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the server directory with the following variables:

```
PORT=3001
GOOGLE_API_KEY=your_google_api_key_here
```

Get a Google Translate API key from the [Google Cloud Console](https://console.cloud.google.com/apis/library/translate.googleapis.com).

## Running the Server

Start the development server:

```bash
npm run dev
```

Or start the production server:

```bash
npm start
```

## API Endpoints

### Convert Excel to JSONL

**POST /api/v1/files/conversion**

Converts an Excel file to JSONL format with English translation.

- Request: multipart/form-data with a file field named "file"
- Response: JSONL file as a downloadable attachment

## File Format Requirements

### Excel (.xlsx) Format

The Excel file should contain at least the following columns:
- `conversationId` or `conversation_id`: A unique identifier for each conversation
- `conversation`: The full text of the conversation

Optional columns:
- `Agent` or `agent`: The name or ID of the agent involved
- `timestamp`: When the conversation occurred
- `source_intent` or `sourceIntent`: The initial intent or category

### JSONL Format

Each line in the JSONL file should be a valid JSON object with the following structure:

```json
{
  "item": {
    "conversationId": 1001,
    "conversation": "Customer: I need help\nAgent: How can I assist you today?",
    "Agent": "GPT-4",
    "timestamp": "2023-01-15T14:30:00Z",
    "source_intent": "general_inquiry"
  }
}
```

## Integration with Frontend

This server is designed to work with the Open Evals App frontend. To run both together:

1. In the root project directory, install concurrently:

```bash
npm install --save-dev concurrently
```

2. Run both server and frontend:

```bash
npm run dev:full
``` 