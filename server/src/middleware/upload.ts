import multer from "multer";

const allowedMimeTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    const lowerName = file.originalname.toLowerCase();
    const isAllowedExtension = lowerName.endsWith(".csv") || lowerName.endsWith(".xlsx");

    if (isAllowedExtension && (allowedMimeTypes.has(file.mimetype) || file.mimetype === "")) {
      return callback(null, true);
    }

    callback(new Error("Only CSV and XLSX files are supported"));
  },
});
