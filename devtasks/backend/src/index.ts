import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import sectionRoutes from './routes/sections';
import taskRoutes from './routes/tasks';
import sectionTaskRoutes from './routes/sectionTasks';
import commentRoutes from './routes/comments';
import tagRoutes from './routes/tags';
import tagCrudRoutes from './routes/tags';
import templateRoutes from './routes/templates';
import templateCrudRoutes from './routes/templates';
import searchRoutes from './routes/search';
import attachmentRoutes from './routes/attachments';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', sectionRoutes);   // /api/projects/:projectId/sections
app.use('/api/sections', sectionRoutes);   // /api/sections/:id (PATCH, DELETE)
app.use('/api/tasks', taskRoutes);        // /api/tasks/:id, PATCH move/archive, tags
app.use('/api/sections', sectionTaskRoutes); // /api/sections/:sectionId/tasks
app.use('/api/tasks', commentRoutes);     // /api/tasks/:taskId/comments
app.use('/api/tasks', attachmentRoutes); // /api/tasks/:id/attachments
app.use('/api/projects', tagRoutes);      // /api/projects/:projectId/tags
app.use('/api/tags', tagCrudRoutes);      // /api/tags/:id (PATCH, DELETE)
app.use('/api/projects', templateRoutes); // /api/projects/:projectId/templates
app.use('/api/templates', templateCrudRoutes); // /api/templates/:id (PATCH, DELETE)
app.use('/api/search', searchRoutes);     // /api/search?q=query

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 DevTasks API running on http://localhost:${PORT}`);
});
