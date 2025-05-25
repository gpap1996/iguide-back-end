# iGuide Backend

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Firebase Storage Setup

This project uses Firebase Storage for file uploads. Before starting the application, make sure to set up your Firebase project and configure the environment variables:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable Firebase Storage in your project
3. Create a service account and download the private key JSON file
4. Copy the `.env.example` file to `.env` and fill in the Firebase credentials
5. Make sure to set `FIREBASE_STORAGE_BUCKET` to your Firebase Storage bucket name (usually `your-project-id.appspot.com`)

More detailed instructions can be found in [firebase-setup.md](firebase-setup.md).

## File Upload Features

- **Streaming Uploads**: Files are processed as streams to minimize memory usage
- **Controlled Concurrency**: Prevents server overload during mass uploads
- **Image Optimization**: Automatically optimizes images and generates thumbnails
- **Firebase Storage**: Files are stored in Firebase Storage instead of locally
- **Error Handling**: Robust error handling for file processing failures
