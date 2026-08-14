import fs from "node:fs/promises";
import path from "node:path";

const uploadDirectory = path.resolve(
  process.cwd(),
  "storage",
  "uploads",
);

export const ensureUploadDirectory = async () => {
  await fs.mkdir(uploadDirectory, {
    recursive: true,
  });
};

export const getUploadPath = (storageKey: string) => {
  return path.join(uploadDirectory, storageKey);
};

export const saveUploadedFile = async (
  storageKey: string,
  buffer: Buffer,
) => {
  await ensureUploadDirectory();

  const filePath = getUploadPath(storageKey);

  await fs.writeFile(filePath, buffer);

  return filePath;
};

export const deleteUploadedFile = async (storageKey: string) => {
  const filePath = getUploadPath(storageKey);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};