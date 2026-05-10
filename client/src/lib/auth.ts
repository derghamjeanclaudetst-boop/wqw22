import { apiRequest } from "./queryClient";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  role: any | null;
  permissions: string[];
}

export const authApi = {
  login: async (username: string, password: string): Promise<AuthState> => {
    const response = await apiRequest("POST", "/api/auth/login", { username, password });
    return response.json();
  },

  logout: async (): Promise<void> => {
    await apiRequest("POST", "/api/auth/logout");
  },

  getCurrentUser: async (): Promise<AuthState> => {
    const response = await apiRequest("GET", "/api/auth/me");
    return response.json();
  },
};
