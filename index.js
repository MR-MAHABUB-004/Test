const axios = require('axios');
const fs = require('fs');
const { alldown } = require("nayan-videos-downloader");
const ffmpeg = require('fluent-ffmpeg');
const pathToFfmpeg = require('ffmpeg-ffprobe-static');

// Lista de URLs das plataformas de vídeos
const videoPlatforms = [
  "https://www.facebook.com",
  "https://facebook.com",
  "https://www.tiktok.com",
  "https://tiktok.com",
  "https://vm.tiktok.com",
  "https://vt.tiktok.com", // Adicionado aqui
  "https://www.x.com",
  "https://x.com",
  "https://www.twitter.com",
  "https://twitter.com",
  "https://www.instagram.com",
  "https://instagram.com",
  "https://www.pinterest.com",
  "https://pinterest.com",
  "https://drive.google.com",
  "https://www.google.com/drive",
  "https://www.capcut.com",
  "https://capcut.com",
  "https://www.likee.video",
  "https://likee.video",
  "https://www.threads.net",
  "https://threads.net"
];

// Função para verificar se o link é de vídeo
const isVideoLink = (link) => videoPlatforms.some(platform => link.startsWith(platform));

// Configuração padrão
const defaultConfig = {
  autocrop: false, // Parâmetro padrão
  extractAudio: false // Novo parâmetro para extrair áudio
};

const MediaDownloader = async (url, options = {}) => {
  const config = { ...defaultConfig, ...options };

  if (!url || !url.includes("http")) {
    throw new Error("Por favor, especifique uma URL de vídeo...");
  }

  url = extractUrlFromString(url);

  if (!isVideoLink(url)) {
    const videoFile = await downloadDirectVideo(url, config); // Tenta baixar diretamente
    if (videoFile) {
      return videoFile;
    } else {
      throw new Error("URL não suportada. Forneça uma URL de vídeo válida.");
    }
  }

  await deleteTempVideos();

  if (url.includes("http")) {
    const videoFile = await downloadSmartVideo(url, config);
    return videoFile;
  } else {
    throw new Error("Especifique uma URL de vídeo válida, como Instagram, YouTube ou TikTok.");
  }
};

async function downloadSmartVideo(url, config) {
  try {
    const data = await alldown(url);

    if (!data || !data.data) {
      throw new Error("Não foi possível baixar este link.");
    }

    // Verifica se há um aviso de "sensitive content"
    if (data.data.isSensitiveContent) {
      console.warn("Este vídeo contém conteúdo sensível. Prossiga com cuidado.");
      // Opcional: Retornar uma mensagem ou lançar um erro
      throw new Error("Este vídeo contém conteúdo sensível e não pode ser baixado.");
    }

    const videoUrl = data.data.high || data.data.low;
    if (!videoUrl) {
      throw new Error("Não foi possível encontrar um vídeo para este link.");
    }

    return saveVideoToFile(videoUrl, config);
  } catch (error) {
    throw new Error(`Erro ao baixar o vídeo: ${error.message}`);
  }
}

async function downloadDirectVideo(url, config) {
  return saveVideoToFile(url, config);
}

async function saveVideoToFile(videoUrl, config) {
  try {
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const fileName = generateUniqueFileName('temp_video.mp4');
    const videoWriter = fs.createWriteStream(fileName);

    response.data.pipe(videoWriter);

    return new Promise((resolve, reject) => {
      videoWriter.on('finish', async () => {
        if (config.extractAudio) {
          try {
            const audioFileName = await extractAudio(fileName);
            resolve(audioFileName);
          } catch (error) {
            reject(error);
          }
        } else if (config.autocrop) {
          try {
            const croppedFileName = await autoCrop(fileName);
            resolve(croppedFileName);
          } catch (error) {
            reject(error);
          }
        } else {
          resolve(fileName);
        }
      });
      videoWriter.on('error', (error) => reject(error));
    });
  } catch (error) {
    throw new Error(`Erro ao salvar o vídeo: ${error.message}`);
  }
}

async function extractAudio(videoFileName) {
  const audioFileName = videoFileName.replace('.mp4', '.mp3');

  return new Promise((resolve, reject) => {
    ffmpeg(videoFileName)
      .setFfmpegPath(pathToFfmpeg.ffmpegPath)
      .output(audioFileName)
      .audioCodec('libmp3lame')
      .on('end', () => resolve(audioFileName))
      .on('error', (err) => reject(`Erro ao extrair o áudio: ${err.message}`))
      .run();
  });
}

function extractUrlFromString(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

function generateUniqueFileName(baseName) {
  let fileName = baseName;
  let count = 1;
  while (fs.existsSync(fileName)) {
    fileName = baseName.replace('.mp4', `_${count}.mp4`);
    count++;
  }
  return fileName;
}

async function deleteTempVideos() {
  try {
    const files = fs.readdirSync("./");
    files.filter(file => file.startsWith('temp_video')).forEach(file => fs.unlinkSync(file));
  } catch (error) {
    throw new Error(`Erro ao deletar vídeos temporários: ${error.message}`);
  }
}

async function autoCrop(fileName) {
  const outputPath = fileName.replace('.mp4', '_cropped.mp4');

  return new Promise((resolve, reject) => {
    ffmpeg(fileName)
      .videoFilters('cropdetect')
      .on('end', function(stdout, stderr) {
        const crop = parseCrop(stderr);
        if (!crop) {
          reject(new Error('Não foi possível detectar os valores de crop.'));
          return;
        }

        ffmpeg(fileName)
          .videoFilters(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`)
          .on('end', () => resolve(outputPath))
          .on('error', (err) => reject(err))
          .save(outputPath);
      })
      .on('error', (err) => reject(err))
      .run();
  });
}

function parseCrop(stderr) {
  const cropRegex = /crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/;
  const match = stderr.match(cropRegex);
  return match ? { width: match[1], height: match[2], x: match[3], y: match[4] } : null;
}

MediaDownloader.isVideoLink = isVideoLink;

module.exports = MediaDownloader;
