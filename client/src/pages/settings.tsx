import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Upload, Trash2, CheckCircle2, Loader2, ImageIcon, RotateCcw, Shield, Lock, LockOpen, KeyRound, Eye, EyeOff, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSystemSettings } from "@/contexts/system-settings";
import { apiRequest } from "@/lib/queryClient";
import { lockAdminTools } from "@/components/admin-pin-guard";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/language";

export default function SystemSettings() {
  const { systemName, logoUrl, refresh } = useSystemSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { language, toggleLanguage, isRTL } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nameInput, setNameInput] = useState(systemName);
  const [nameSaved, setNameSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Keep nameInput in sync if context changes (e.g. on first load)
  const [synced, setSynced] = useState(false);
  if (!synced && systemName !== "NOVIQ") { setNameInput(systemName); setSynced(true); }

  // ── Save system name ─────────────────────────────────────────────────────
  const nameMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("PATCH", "/api/settings/system", { systemName: name }),
    onSuccess: async () => {
      await refresh();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
      toast({ title: "System name updated" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Upload logo ──────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/settings/logo", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      setLogoPreview(null);
      await refresh();
      toast({ title: "Logo updated" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Remove logo ──────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: () => fetch("/api/settings/logo", { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: async () => {
      setLogoPreview(null);
      await refresh();
      toast({ title: "Logo removed" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const effectiveLogoUrl = logoPreview || logoUrl;
  const isWorking = nameMutation.isPending || uploading || removeMutation.isPending;

  // ── Admin PIN management ──────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data: pinStatus } = useQuery<{ hasPIN: boolean }>({
    queryKey: ["/api/settings/admin-pin/status"],
    staleTime: 10_000,
  });
  const hasPIN = pinStatus?.hasPIN ?? false;

  const [pinMode, setPinMode] = useState<"idle" | "set" | "change" | "remove">("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPins, setShowPins] = useState(false);

  const setPinMutation = useMutation({
    mutationFn: (body: { pin: string; currentPin?: string }) =>
      apiRequest("PATCH", "/api/settings/admin-pin", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/admin-pin/status"] });
      toast({ title: hasPIN ? "PIN updated successfully" : "Admin PIN set successfully" });
      setPinMode("idle");
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const removePinMutation = useMutation({
    mutationFn: (body: { currentPin: string }) =>
      apiRequest("DELETE", "/api/settings/admin-pin", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/admin-pin/status"] });
      toast({ title: "Admin PIN removed" });
      setPinMode("idle");
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleSetPin() {
    if (!/^\d{4,8}$/.test(newPin)) {
      toast({ title: "PIN must be 4–8 digits", variant: "destructive" }); return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "PINs do not match", variant: "destructive" }); return;
    }
    setPinMutation.mutate(hasPIN ? { pin: newPin, currentPin } : { pin: newPin });
  }

  function handleRemovePin() {
    if (!currentPin) { toast({ title: "Enter your current PIN", variant: "destructive" }); return; }
    removePinMutation.mutate({ currentPin });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-slate-700 rounded-xl">
          <Settings className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("settings.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("settings.subtitle")}</p>
        </div>
      </div>

      {/* ── Language ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Languages className="h-4 w-4" /> {t("settings.language")}
              </CardTitle>
              <CardDescription>{t("settings.languageDesc")}</CardDescription>
            </div>
            <Badge variant="secondary">{isRTL ? "Arabic / العربية" : "English"}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="gap-2"
            onClick={toggleLanguage}
          >
            <Languages className="h-4 w-4" />
            {isRTL ? "Switch to English" : "التبديل إلى العربية"}
          </Button>
        </CardContent>
      </Card>

      {/* ── System Name ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("settings.systemName")}</CardTitle>
          <CardDescription>{t("settings.systemNameDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sysname">Name</Label>
            <div className="flex gap-2">
              <Input
                id="sysname"
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameSaved(false); }}
                placeholder="NOVIQ"
                maxLength={40}
                className="flex-1"
              />
              <Button
                onClick={() => nameMutation.mutate(nameInput.trim() || "NOVIQ")}
                disabled={nameMutation.isPending || nameInput.trim() === systemName}
                className="gap-2 min-w-[100px]"
              >
                {nameMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : nameSaved ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Saved</>
                ) : "Save"}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-slate-800 px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-slate-400 shrink-0">Preview:</span>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow ring-2 ring-blue-400/20 shrink-0">
              {effectiveLogoUrl ? (
                <img src={effectiveLogoUrl} alt="logo" className="w-5 h-5 object-contain" />
              ) : (
                <Shield className="h-4 w-4 text-white" />
              )}
            </div>
            <span className="text-white font-bold text-base truncate">{nameInput || "NOVIQ"}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Logo ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">System Logo</CardTitle>
          <CardDescription>Replaces the default shield icon in the sidebar and login page. PNG, JPG, SVG or WebP, max 5 MB.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current logo */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden">
              {effectiveLogoUrl ? (
                <img src={effectiveLogoUrl} alt="logo" className="w-12 h-12 object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <ImageIcon className="h-6 w-6 text-slate-400" />
                  <span className="text-[10px] text-slate-400">No logo</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload Image"}
              </Button>
              {logoUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate()}
                >
                  {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove Logo
                </Button>
              )}
              {!logoUrl && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Default shield icon is used
                </p>
              )}
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Show preview immediately
              const reader = new FileReader();
              reader.onload = ev => setLogoPreview(ev.target?.result as string);
              reader.readAsDataURL(file);
              handleLogoUpload(file);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      {/* ── Admin PIN ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Admin Tools PIN Lock
              </CardTitle>
              <CardDescription>
                Require a PIN before accessing Admin Tools pages (Data Import, Database Import/Export, System Settings).
              </CardDescription>
            </div>
            <Badge variant={hasPIN ? "default" : "secondary"} className={hasPIN ? "bg-emerald-600 text-white" : ""}>
              {hasPIN ? <><Lock className="h-3 w-3 mr-1" />Active</> : <><LockOpen className="h-3 w-3 mr-1" />Not set</>}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pinMode === "idle" && (
            <div className="flex flex-wrap gap-2">
              {!hasPIN && (
                <Button size="sm" className="gap-2" onClick={() => setPinMode("set")}>
                  <Lock className="h-4 w-4" /> Set PIN
                </Button>
              )}
              {hasPIN && (
                <>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setPinMode("change")}>
                    <KeyRound className="h-4 w-4" /> Change PIN
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                    onClick={() => setPinMode("remove")}
                  >
                    <LockOpen className="h-4 w-4" /> Remove PIN
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2 text-slate-500"
                    onClick={() => { lockAdminTools(); toast({ title: "Admin Tools locked — PIN required to re-enter" }); }}
                  >
                    <Lock className="h-4 w-4" /> Lock now
                  </Button>
                </>
              )}
            </div>
          )}

          {(pinMode === "set" || pinMode === "change") && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {pinMode === "change" ? "Change Admin PIN" : "Set Admin PIN"}
              </p>

              {hasPIN && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Current PIN</Label>
                  <div className="relative">
                    <Input
                      type={showPins ? "text" : "password"}
                      inputMode="numeric"
                      placeholder="Enter current PIN"
                      value={currentPin}
                      onChange={e => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPins(p => !p)}
                    >
                      {showPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">New PIN <span className="text-slate-400">(4–8 digits)</span></Label>
                <Input
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="e.g. 1234"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Confirm New PIN</Label>
                <Input
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="Repeat PIN"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={e => { if (e.key === "Enter") handleSetPin(); }}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSetPin} disabled={setPinMutation.isPending} className="gap-2">
                  {setPinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {setPinMutation.isPending ? "Saving…" : "Save PIN"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPinMode("idle"); setCurrentPin(""); setNewPin(""); setConfirmPin(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {pinMode === "remove" && (
            <div className="space-y-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Remove Admin PIN</p>
              <p className="text-xs text-red-600 dark:text-red-500">Admin Tools pages will be accessible to any logged-in user without a PIN.</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Current PIN to confirm</Label>
                <Input
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="Enter your PIN"
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={e => { if (e.key === "Enter") handleRemovePin(); }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleRemovePin}
                  disabled={removePinMutation.isPending}
                  className="gap-2"
                >
                  {removePinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
                  {removePinMutation.isPending ? "Removing…" : "Remove PIN"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPinMode("idle"); setCurrentPin(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {hasPIN && pinMode === "idle" && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              Session stays unlocked for 4 hours after a correct PIN is entered.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Reset to defaults ───────────────────────────────── */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-gray-400 hover:text-gray-600"
          disabled={isWorking}
          onClick={async () => {
            await Promise.all([
              apiRequest("PATCH", "/api/settings/system", { systemName: "NOVIQ", logoUrl: "" }),
              fetch("/api/settings/logo", { method: "DELETE", credentials: "include" }),
            ]);
            setNameInput("NOVIQ");
            setLogoPreview(null);
            await refresh();
            toast({ title: "Settings reset to defaults" });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
