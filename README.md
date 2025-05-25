# iGuide Backend

A robust backend service for the iGuide application, built with Hono, TypeScript, and Firebase Storage.

## Features

- **File Management System**

  - Secure file uploads with size and type validation
    - Maximum file size: 10MB per file
    - Maximum batch size: 100MB total
    - Maximum files per batch: 50 files
  - Supported file types:
    - Images: JPEG, PNG, GIF, WebP (max 4K resolution)
    - Audio: MPEG, WAV, OGG, M4A
  - Image optimization and thumbnail generation (300px thumbnails)
  - Multi-language support for file metadata
  - Batch upload and delete operations
  - Firebase Storage integration

- **Database**

  - PostgreSQL with Drizzle ORM
  - Multi-language support
  - Efficient querying and data management

- **API**
  - RESTful endpoints with Hono
  - Request validation with Zod
  - Proper error handling and status codes
  - Authentication and authorization

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
- Firebase project with Storage enabled

## Getting Started

1. **Clone the repository**

   ```bash
   git clone [repository-url]
   cd iguide-back-end
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**

   - Copy `.env.example` to `.env`
   - Fill in the required environment variables:
     ```
     DATABASE_URL=postgresql://user:password@localhost:5432/dbname
     FIREBASE_PROJECT_ID=your-project-id
     FIREBASE_PRIVATE_KEY=your-private-key
     FIREBASE_CLIENT_EMAIL=your-client-email
     FIREBASE_STORAGE_BUCKET=your-bucket-name
     ```

4. **Database Setup**

   ```bash
   npm run db:migrate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The server will start at http://localhost:3000

## Firebase Storage Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable Firebase Storage
3. Create a service account and download the private key JSON
4. Configure your `.env` file with the Firebase credentials
5. Set up Firebase Storage rules (see [firebase-setup.md](firebase-setup.md))

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:migrate` - Run database migrations
- `npm run create-admin` - Create an admin user

## Documentation

- [File Management System](docs/file-management.md) - Comprehensive guide to file handling
- [Firebase Setup](firebase-setup.md) - Detailed Firebase configuration instructions
- [API Documentation](docs/api.md) - API endpoints and usage

## Project Structure

```
src/
├── routes/          # API routes
├── db/             # Database schema and migrations
├── utils/          # Utility functions
│   ├── fileStorage.ts    # File storage implementation
│   └── imageOptimization.ts  # Image processing
└── scripts/        # Utility scripts
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
