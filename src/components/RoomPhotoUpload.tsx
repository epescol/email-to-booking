import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RoomPhotoUploadProps {
  photos: (string | null)[];
  onPhotosChange: (photos: string[]) => void;
  roomId?: string;
}

export function RoomPhotoUpload({ photos, onPhotosChange, roomId }: RoomPhotoUploadProps) {
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);

  const currentPhotos = photos.filter(Boolean) as string[];

  const handleUpload = async (file: File, slotIndex: number) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un file immagine");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'immagine non può superare 5MB");
      return;
    }

    setUploading(slotIndex);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const prefix = roomId || "new";
      const path = `${prefix}/${Date.now()}-${slotIndex}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("room-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("room-photos")
        .getPublicUrl(path);

      const newPhotos = [...photos.map(p => p || "")];
      // Ensure array has 4 slots
      while (newPhotos.length < 4) newPhotos.push("");
      newPhotos[slotIndex] = urlData.publicUrl;
      onPhotosChange(newPhotos);
      toast.success("Foto caricata");
    } catch (err: any) {
      toast.error(err.message || "Errore nel caricamento");
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...photos.map(p => p || "")];
    while (newPhotos.length < 4) newPhotos.push("");
    newPhotos[index] = "";
    onPhotosChange(newPhotos);
  };

  const triggerUpload = (slotIndex: number) => {
    setPendingSlot(slotIndex);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingSlot !== null) {
      handleUpload(file, pendingSlot);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingSlot(null);
  };

  // Build 4 slots
  const slots = Array.from({ length: 4 }, (_, i) => {
    const photoUrl = photos[i] || null;
    return { index: i, url: photoUrl };
  });

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="grid grid-cols-2 gap-2">
        {slots.map((slot) => (
          <div
            key={slot.index}
            className="relative aspect-video rounded-lg border border-border bg-muted/30 overflow-hidden group"
          >
            {uploading === slot.index ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : slot.url ? (
              <>
                <img
                  src={slot.url}
                  alt={`Foto ${slot.index + 1}`}
                  className="w-full h-full object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removePhoto(slot.index)}
                >
                  <X className="h-3 w-3" />
                </Button>
                {/* Click to replace */}
                <button
                  type="button"
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 flex items-center justify-center"
                  onClick={() => triggerUpload(slot.index)}
                >
                  <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Sostituisci</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex flex-col items-center justify-center h-full w-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={() => triggerUpload(slot.index)}
              >
                <ImagePlus className="h-5 w-5 mb-1" />
                <span className="text-xs">Foto {slot.index + 1}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
