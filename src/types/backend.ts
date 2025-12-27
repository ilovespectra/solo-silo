export type MediaFile = {
  id: number;
  path: string;
  type: string;
  date_taken?: number | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  camera?: string | null;
  lens?: string | null;
};
