export const SKIP_IMAGES_KEY = "rightwrite:personalization:skipImages";

export function isSkippingImages(): boolean {
  return localStorage.getItem(SKIP_IMAGES_KEY) === "true";
}

export function setSkippingImages(v: boolean): void {
  if (v) localStorage.setItem(SKIP_IMAGES_KEY, "true");
  else localStorage.removeItem(SKIP_IMAGES_KEY);
}
