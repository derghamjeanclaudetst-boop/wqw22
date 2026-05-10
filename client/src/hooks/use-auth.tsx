import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi, AuthState } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    role: null,
    permissions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await authApi.getCurrentUser();
        // Debug logging for permissions
        if (data.user?.username === 'qqq') {
          console.log('Manager user checkAuth - Auth data:', data);
          console.log('Manager permissions:', data.permissions);
        }
        setAuthState(data);
      } catch (error) {
        // User not authenticated
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const data = await authApi.login(username, password);
      // Debug logging for permissions
      if (username === 'qqq') {
        console.log('Manager user login - Auth data:', data);
        console.log('Manager permissions:', data.permissions);
      }
      setAuthState(data);
      toast({
        title: "Success",
        description: "Logged in successfully",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Login failed",
        variant: "destructive",
      });
      return false;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
      setAuthState({ user: null, role: null, permissions: [] });
      toast({
        title: "Success",
        description: "Logged out successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Logout failed",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
