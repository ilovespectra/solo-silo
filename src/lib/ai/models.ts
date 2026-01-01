/**
 * AI/ML utilities using open-source models from Xenova/transformers
 * All models run locally - no data is sent to external servers
 */

import { pipeline, env, Pipeline } from '@xenova/transformers';
import path from 'path';


env.allowLocalModels = true;
env.allowRemoteModels = true;
env.cacheDir = path.join(process.cwd(), '.local/models');


let textExtractor: Pipeline | null = null;
let imageClassifier: Pipeline | null = null;
let objectDetector: Pipeline | null = null;

export async function initializeModels(): Promise<void> {
  try {
    console.log('Initializing AI models (first run may download models - this can take a few minutes)...');


    if (!textExtractor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      textExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as any;
      console.log('✓ Text embedding model loaded');
    }


    if (!imageClassifier) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      imageClassifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32') as any;
      console.log('✓ Image classifier loaded');
    }


    if (!objectDetector) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      objectDetector = await pipeline('object-detection', 'Xenova/detr-resnet-50') as any;
      console.log('✓ Object detector loaded');
    }

    console.log('✓ All models initialized successfully');
  } catch (error) {
    console.error('Error initializing models:', error);
    throw error;
  }
}

export async function generateTextEmbedding(text: string): Promise<number[] | null> {
  try {
    if (!textExtractor) {
      await initializeModels();
    }

    if (!textExtractor) {
      throw new Error('Text extractor failed to initialize');
    }

    const embedding = await textExtractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(embedding.data);
  } catch (error) {
    console.error('Error generating text embedding:', error);
    return null;
  }
}

export async function analyzeImage(imagePath: string): Promise<{
  objects: { label: string; score: number }[];
  categories: { label: string; score: number }[];
} | null> {
  try {
    if (!objectDetector || !imageClassifier) {
      await initializeModels();
    }

    if (!objectDetector || !imageClassifier) {
      throw new Error('Models failed to initialize');
    }

    const detections = await objectDetector(imagePath);
    const objects = (detections as Array<{ label: string; score: number; box: unknown }>)
      .filter((d) => d.score > 0.3)
      .map((d) => ({ label: d.label, score: d.score }));


    const categories = await imageClassifier(imagePath, COMMON_OBJECTS);
    const topCategories = (categories as Array<{ label: string; score: number }>)
      .slice(0, 5)
      .map((c) => ({ label: c.label, score: c.score }));

    return { objects, categories: topCategories };
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

export async function classifyText(
  text: string,
  candidateLabels: string[]
): Promise<{ label: string; score: number }[]> {
  try {

    const results = candidateLabels.map(label => {
      const score = text.toLowerCase().includes(label.toLowerCase()) ? 0.8 : 0.1;
      return { label, score };
    });
    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error classifying text:', error);
    return [];
  }
}


export async function semanticSearch(
  query: string,
  documentsWithEmbeddings: { text: string; embedding: number[] }[],
  topK: number = 20
): Promise<{ index: number; score: number; text: string }[]> {
  try {
    const queryEmbedding = await generateTextEmbedding(query);
    if (!queryEmbedding) {
      console.error('Failed to generate query embedding');
      return [];
    }

    const results = documentsWithEmbeddings.map((doc, idx) => {
      if (!doc.embedding || doc.embedding.length === 0) {
        return { index: idx, score: 0, text: doc.text };
      }


      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
      return { index: idx, score: similarity, text: doc.text };
    });

    return results
      .filter(r => r.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    console.error('Error in semantic search:', error);
    return [];
  }
}


function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}


export const COMMON_OBJECTS = [
  'person',
  'bicycle',
  'car',
  'dog',
  'cat',
  'bird',
  'animal',
  'outdoor',
  'indoor',
  'nature',
  'building',
  'vehicle',
  'food',
  'plant',
  'sports',
  'celebration',
  'holiday',
  'family',
  'group',
  'action',
];

export const SPECIAL_OCCASIONS = [
  'birthday',
  'wedding',
  'graduation',
  'anniversary',
  'christmas',
  'thanksgiving',
  'easter',
  'halloween',
  'vacation',
  'concert',
  'festival',
  'party',
];

export const LOCATION_TERMS = [
  'beach',
  'mountain',
  'park',
  'forest',
  'city',
  'street',
  'home',
  'office',
  'restaurant',
  'cafe',
  'store',
  'airport',
  'water',
  'lake',
  'river',
  'garden',
];
