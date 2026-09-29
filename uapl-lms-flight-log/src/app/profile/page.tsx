"use client";

import { AppShell } from "@/components/app-shell";
import { LoadingOverlay } from "@/components/loading-overlay";
import { useAppMessage } from "@/components/message-provider";
import {
  deleteOwnAvatar,
  fetchOwnProfile,
  saveOwnProfile,
  uploadOwnAvatar,
  type UserProfile
} from "@/lib/profile-api";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

async function optimizedAvatar(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - side) / 2;
    const sourceY = (image.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this image.");
    context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 512, 512);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality)
      );
      if (blob && blob.size < 480 * 1024) return blob;
    }
    throw new Error("The photo could not be compressed below the secure upload limit.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProfilePage() {
  const message = useAppMessage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchOwnProfile()
      .then((result) => {
        setProfile(result);
        setName(result.name);
        setPhotoURL(result.photoURL);
        setAvatarPath(result.avatarPath);
      })
      .catch((error) => message.notify({ type: "error", title: "Profile unavailable", message: error instanceof Error ? error.message : "Please try again." }))
      .finally(() => setLoading(false));
  }, [message]);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      message.notify({ type: "warning", title: "Photo not accepted", message: "Choose a JPEG, PNG, or WebP image smaller than 2 MB." });
      return;
    }
    setUploading(true);
    try {
      const image = await optimizedAvatar(file);
      const uploaded = await uploadOwnAvatar(image);
      const updated = await saveOwnProfile({
        name: name.trim() || profile?.name || "User",
        photoURL: uploaded.url,
        avatarPath: uploaded.path
      });
      setProfile(updated);
      setPhotoURL(updated.photoURL);
      setAvatarPath(updated.avatarPath);
      message.notify({ type: "success", title: "Profile photo updated", message: "Your new photo is now visible across the application." });
    } catch (error) {
      message.notify({ type: "error", title: "Upload failed", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setUploading(true);
    try {
      await deleteOwnAvatar(avatarPath);
      const updated = await saveOwnProfile({
        name: name.trim() || profile?.name || "User",
        photoURL: "",
        avatarPath: ""
      });
      setProfile(updated);
      setPhotoURL("");
      setAvatarPath("");
      message.notify({ type: "success", title: "Photo removed", message: "Your profile picture has been removed." });
    } catch (error) {
      message.notify({ type: "error", title: "Photo could not be removed", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const updated = await saveOwnProfile({ name: name.trim(), photoURL, avatarPath });
      setProfile(updated);
      message.notify({ type: "success", title: "Profile updated", message: "Your account information is now current." });
    } catch (error) {
      message.notify({ type: "error", title: "Update failed", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      {loading ? <LoadingOverlay label="Opening your profile..." /> : null}
      <div className="app-page max-w-5xl">
        <header className="app-page-header">
          <p className="app-section-label">Account</p>
          <h1 className="app-title mt-1">My Profile</h1>
          <p className="app-subtitle mt-2">Manage your identity and profile picture.</p>
        </header>

        {profile ? (
          <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <section className="app-card text-center">
              <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-[#e9f3f8] text-3xl font-bold text-[#075f8f] ring-4 ring-white shadow-lg outline outline-1 outline-[#d7e0ea]">
                {photoURL ? <img key={`${photoURL}-${profile.updatedAt}`} src={`${photoURL}${photoURL.includes("?") ? "&" : "?"}v=${encodeURIComponent(profile.updatedAt || "current")}`} alt="Profile" className="h-full w-full object-cover" /> : initials(name)}
              </div>
              <h2 className="mt-5 text-lg font-bold text-[#16263c]">{name || profile.name}</h2>
              <p className="mt-1 text-sm capitalize text-[#718096]">{profile.role} account</p>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={selectPhoto} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="app-button-primary mt-5 w-full justify-center">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Change photo
              </button>
              {photoURL ? <button type="button" onClick={() => void removePhoto()} disabled={uploading} className="mt-3 inline-flex h-10 items-center justify-center gap-2 text-sm font-semibold text-rose-700 hover:underline"><Trash2 size={15} /> Remove photo</button> : null}
              <p className="mt-4 text-xs leading-5 text-[#7b8ca0]">JPEG, PNG, or WebP. The image is cropped and compressed before upload.</p>
            </section>

            <section className="app-card">
              <div className="flex items-center gap-3 border-b border-[#e5ebf2] pb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><UserRound size={19} /></div>
                <div><h2 className="app-section-title">Profile details</h2><p className="mt-1 text-sm text-[#718096]">Information shown across the application.</p></div>
              </div>
              <div className="mt-5 space-y-5">
                <label className="block"><span className="text-sm font-semibold text-[#405168]">Display name</span><input className="app-input mt-2" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
                <ReadOnlyField icon={Mail} label="Email address" value={profile.email} />
                <ReadOnlyField icon={ShieldCheck} label="Account access" value={`${profile.role} · ${profile.status}`} capitalize />
                <div className="flex flex-col-reverse gap-3 border-t border-[#e5ebf2] pt-5 sm:flex-row sm:justify-between">
                  <Link href="/change-password" className="app-button-secondary justify-center"><KeyRound size={16} /> Change password</Link>
                  <button type="submit" disabled={saving || name.trim().length < 2} className="app-button-primary justify-center">{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {saving ? "Saving..." : "Save profile"}</button>
                </div>
              </div>
            </section>
          </form>
        ) : null}
      </div>
    </AppShell>
  );
}

function ReadOnlyField({ icon: Icon, label, value, capitalize = false }: { icon: typeof Mail; label: string; value: string; capitalize?: boolean }) {
  return <div><p className="text-sm font-semibold text-[#405168]">{label}</p><div className="mt-2 flex min-h-12 items-center gap-3 rounded-lg border border-[#d7e0ea] bg-[#f7f9fb] px-4 text-sm text-[#52667d]"><Icon size={17} className="shrink-0 text-[#718096]" /><span className={capitalize ? "capitalize" : "break-all"}>{value || "-"}</span></div></div>;
}
