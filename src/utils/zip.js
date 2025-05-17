const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function zipFiles(filePaths) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join("./temp", `zipped-${Date.now()}.zip`);
    fs.mkdirSync("./temp", { recursive: true });
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    filePaths.forEach((filePath) => {
      archive.file(filePath, { name: path.basename(filePath) });
    });

    archive.finalize();
  });
}

function zipFolder(folderPath) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join("./temp", `zipped-folder-${Date.now()}.zip`);
    fs.mkdirSync("./temp", { recursive: true });
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    archive.directory(folderPath, false);
    archive.finalize();
  });
}

async function convertFile(filePath, format) {
  const outputPath = path.join("./temp", `${path.basename(filePath, path.extname(filePath))}.${format}`);
  fs.mkdirSync("./temp", { recursive: true });
  if (["jpg", "png"].includes(format)) {
    await sharp(filePath).toFormat(format).toFile(outputPath);
  } else if (format === "pdf") {
    // PDF 변환은 예시로 생략 (실제 구현 필요)
    fs.copyFileSync(filePath, outputPath);
  }
  return outputPath;
}

module.exports = { zipFiles, zipFolder, convertFile };
