import { useState, useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";

// Local storage keys
export const API_KEY_STORAGE_KEY = "evalApiKey";
export const BASE_URL_STORAGE_KEY = "evalBaseUrl";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [testing, setTesting] = useState(false);
  const { theme } = useTheme();
  
  // Load saved settings on initial render
  useEffect(() => {
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
    const savedBaseUrl = localStorage.getItem(BASE_URL_STORAGE_KEY) || "https://api.openai.com/v1";
    
    setApiKey(savedApiKey);
    setBaseUrl(savedBaseUrl);
  }, []);

  const handleTest = async () => {
    if (!apiKey) {
      toast.error("Please enter an API key");
      return;
    }
    
    setTesting(true);
    try {
      // Simulate API test
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For demo purposes, assume success if key starts with "sk-"
      if (apiKey.startsWith("sk-")) {
        toast.success("Connection successful!");
      } else {
        toast.error("Invalid API key format");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      toast.error("Connection failed. Please check your credentials.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    // Save settings to localStorage
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
    
    toast.success("Settings saved successfully");
  };

  return (
    <PageContainer
      title="Settings"
      description="Configure API keys and application preferences"
    >
      <div className="max-w-2xl">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="api-key">OpenAI API Key</Label>
                <div className="flex space-x-2">
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <Button variant="outline" onClick={handleTest} disabled={testing}>
                    {testing ? "Testing..." : "Test"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Required for OpenAI API access
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="base-url">API Base URL</Label>
                <Input
                  id="base-url"
                  placeholder="https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Default: https://api.openai.com/v1
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">
                  Customize the application appearance
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {theme === "dark" ? "Dark Mode" : "Light Mode"}
                </span>
                <ThemeToggle />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="flex gap-4">
          <Button onClick={handleSave}>Save Settings</Button>
          <Button variant="outline">Reset</Button>
        </div>
      </div>
    </PageContainer>
  );
}
