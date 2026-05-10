import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useSystemSettings } from "@/contexts/system-settings";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/language";

export default function Login() {
  const { systemName, logoUrl } = useSystemSettings();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { language, toggleLanguage, isRTL } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError("");

    try {
      const success = await login(username, password);
      if (success) {
        setLocation("/");
      } else {
        setLoginError(t("login.invalidCredentials"));
      }
    } catch (error: any) {
      setLoginError(t("login.invalidCredentials"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Language Toggle */}
        <div className="flex justify-end">
          <button
            onClick={toggleLanguage}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium px-3 py-1 rounded-lg border border-slate-200 hover:border-slate-300 transition-all"
          >
            {language === "en" ? "العربية" : "English"}
          </button>
        </div>

        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
            {logoUrl ? <img src={logoUrl} alt="logo" className="w-8 h-8 object-contain" /> : <Shield className="h-6 w-6 text-white" />}
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">{systemName}</h2>
          <p className="mt-2 text-sm text-gray-600">{t("login.signInToAccount")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.welcomeBack")}</CardTitle>
            <CardDescription>
              {t("login.enterCredentials")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {loginError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">{t("login.username")}</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("login.enterUsername")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.enterPassword")}
                    required
                    className={isRTL ? "pl-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 ${isRTL ? "left-3" : "right-3"}`}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
