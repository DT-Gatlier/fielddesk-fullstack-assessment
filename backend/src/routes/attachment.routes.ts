import { Router } from 'express';
import { uploadAttachment, downloadAttachment, deleteAttachment } from '../controllers/attachment.controller';
import { authenticate } from '../middleware/authenticate';
import { orgScope } from '../middleware/orgScope';
import { upload } from '../middleware/upload';

// The multer error handler to catch file type/size validation errors
const handleUpload = (req: any, res: any, next: any) => {
  const uploader = upload.single('file');
  uploader(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: { message: err.message } });
    }
    next();
  });
};

const router = Router({ mergeParams: true }); // Merge params to get workOrderId

// Apply auth and tenant scope
router.use(authenticate, orgScope);

// Routes
router.post('/', handleUpload, uploadAttachment);
router.get('/:id', downloadAttachment);
router.delete('/:id', deleteAttachment);

export default router;
