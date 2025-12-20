"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  files: Record<string, string>;
  name: string;
}

export const DownloadZipButton = ({ files, name }: Props) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!files || Object.keys(files).length === 0) {
      toast.error("No files to download");
      return;
    }

    setIsDownloading(true);
    try {
      const zip = new JSZip();

      // Add files to zip
      Object.entries(files).forEach(([path, content]) => {
        // Remove leading ./ if present
        const cleanPath = path.startsWith("./") ? path.slice(2) : path;
        zip.file(cleanPath, content);
      });

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${name}.zip`);
      toast.success("Project downloaded successfully");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download project");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={isDownloading}
      className="gap-2"
    >
      {isDownloading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
      Download
    </Button>
  );
};
