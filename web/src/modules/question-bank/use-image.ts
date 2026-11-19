import { useCallback } from "react";

export function useImageBlob(image: Blob) {
  return useCallback((element: HTMLImageElement | null) => {
    if (!element) return;
    const url = URL.createObjectURL(image);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [image]);
}
