import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';


const { Canvas, Image, ImageData } = canvas;

faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as unknown as typeof globalThis);

let modelsLoaded = false;
const MODELS_PATH = path.join(process.cwd(), '.local/models/face-api');

export async function initializeFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  try {
    console.log('Loading face detection models...');
    

    if (!fs.existsSync(MODELS_PATH)) {
      fs.mkdirSync(MODELS_PATH, { recursive: true });
    }


    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
    
    modelsLoaded = true;
    console.log('✓ face detection models loaded successfully');
  } catch (error) {
    console.error('Error loading face models:', error);
    console.log('Downloading face models...');
    

    try {
      await downloadFaceModels();
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
      modelsLoaded = true;
      console.log('✓ face detection models loaded successfully');
    } catch (downloadError) {
      throw new Error(`Failed to load face models: ${downloadError}`);
    }
  }
}

async function downloadFaceModels(): Promise<void> {
  const modelFiles = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2',
  ];

  const baseUrl = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

  for (const file of modelFiles) {
    const url = `${baseUrl}/${file}`;
    const dest = path.join(MODELS_PATH, file);
    
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`Downloaded ${file}`);
    } catch (error) {
      console.warn(`Failed to download ${file}:`, error);
    }
  }
}

export interface FaceDetectionResult {
  descriptor: Float32Array;
  detection: {
    box: { x: number; y: number; width: number; height: number };
    score: number;
  };
  landmarks: faceapi.FaceLandmarks68;
}

export async function detectFaces(imagePath: string): Promise<FaceDetectionResult[]> {
  try {
    await initializeFaceModels();


    const imageBuffer = fs.readFileSync(imagePath);
    const resizedBuffer = await sharp(imageBuffer)
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg()
      .toBuffer();


    const img = new Image();
    img.src = resizedBuffer;


    const detections = await faceapi
      .detectAllFaces(img as unknown as HTMLImageElement)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections || detections.length === 0) {
      return [];
    }

    return detections.map(detection => ({
      descriptor: detection.descriptor,
      detection: {
        box: detection.detection.box,
        score: detection.detection.score,
      },
      landmarks: detection.landmarks,
    }));
  } catch (error) {
    console.error(`Error detecting faces in ${imagePath}:`, error);
    return [];
  }
}

export interface FaceCluster {
  id: string;
  label: string;
  descriptors: Float32Array[];
  imageCount: number;
  sampleImage: string;
  hidden: boolean;
}

export function clusterFaces(
  faceData: Array<{ path: string; faces: FaceDetectionResult[] }>,
  similarityThreshold: number = 0.6
): FaceCluster[] {
  const clusters: FaceCluster[] = [];
  let clusterId = 0;

  for (const { path: imagePath, faces } of faceData) {
    for (const face of faces) {
      let assigned = false;


      for (const cluster of clusters) {

        let maxSimilarity = 0;
        for (const clusterDescriptor of cluster.descriptors) {
          const distance = faceapi.euclideanDistance(face.descriptor, clusterDescriptor);
          const similarity = 1 - distance;
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        if (maxSimilarity >= similarityThreshold) {
          cluster.descriptors.push(face.descriptor);
          cluster.imageCount++;
          assigned = true;
          break;
        }
      }


      if (!assigned) {
        clusters.push({
          id: `face_${clusterId++}`,
          label: 'unknown',
          descriptors: [face.descriptor],
          imageCount: 1,
          sampleImage: imagePath,
          hidden: false,
        });
      }
    }
  }


  return clusters.sort((a, b) => b.imageCount - a.imageCount);
}

export function getClusterSummary(clusters: FaceCluster[]): {
  label: string;
  count: number;
  id: string;
  sampleImage: string;
  hidden: boolean;
}[] {
  return clusters.map(c => ({
    label: c.label,
    count: c.imageCount,
    id: c.id,
    sampleImage: c.sampleImage,
    hidden: c.hidden,
  }));
}
