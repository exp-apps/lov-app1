import { useState, useRef, useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { convertExcelToJsonl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [jsonlData, setJsonlData] = useState<any[]>([]);
  const [convertedJsonlFile, setConvertedJsonlFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("upload");

  // Clean up interval on component unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  // Reset conversion state when file is cleared
  useEffect(() => {
    if (file === null) {
      setIsConverting(false);
      setConversionProgress(0);
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
    }
  }, [file]);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const parseJsonlFile = async (jsonlFile: File) => {
    try {
      const text = await jsonlFile.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      const parsedData = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error("Error parsing JSONL line:", e);
          return null;
        }
      }).filter(item => item !== null);
      
      setJsonlData(parsedData);
    } catch (error) {
      console.error("Error processing JSONL file:", error);
      toast.error("Error processing JSONL file");
    }
  };

  const convertExcelFile = async (excelFile: File) => {
    setIsConverting(true);
    toast.info("Converting Excel to JSONL format and translating all conversations to English...");
    
    // Start progress bar simulation
    simulateProgressBar();
    
    try {
      // Call the real API conversion function
      const convertedFile = await convertExcelToJsonl(excelFile);
      
      // Store the converted file for download option
      setConvertedJsonlFile(convertedFile);
      
      // Parse and display the JSONL content
      await parseJsonlFile(convertedFile);
      
      // Ensure progress bar is complete
      setConversionProgress(100);
      
      setIsConverting(false);
      toast.success("Excel file successfully converted to JSONL format");
      return convertedFile;
    } catch (error) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      setConversionProgress(0);
      setIsConverting(false);
      toast.error(error instanceof Error ? error.message : "Conversion failed. Please try again.");
      throw error;
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    const fileType = selectedFile.name.split(".").pop()?.toLowerCase();
    
    if (!["xlsx", "jsonl"].includes(fileType || "")) {
      toast.error("Invalid file format. Please upload an Excel (.xlsx) or JSONL (.jsonl) file.");
      return;
    }
    
    setFile(selectedFile);
    setConvertedJsonlFile(null);
    setJsonlData([]);
    
    // Process based on file type
    if (selectedFile.name.endsWith(".jsonl")) {
      await parseJsonlFile(selectedFile);
    } else if (selectedFile.name.endsWith(".xlsx")) {
      // Start conversion immediately for Excel files
      try {
        await convertExcelFile(selectedFile);
      } catch (error) {
        console.error("Conversion failed:", error);
        // Error already handled in convertExcelFile
      }
    }
  };

  const simulateProgressBar = () => {
    // Reset progress first
    setConversionProgress(0);
    
    // Clear any existing interval
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    
    // Set up new interval
    progressInterval.current = setInterval(() => {
      setConversionProgress(prev => {
        const newProgress = prev + Math.random() * 5;
        if (newProgress >= 95) {
          if (progressInterval.current) {
            clearInterval(progressInterval.current);
            progressInterval.current = null;
          }
          return 95; // Stop at 95% - will jump to 100% when complete
        }
        return newProgress;
      });
    }, 300);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    // Determine which file to upload
    const fileToUpload = file.name.endsWith(".xlsx") ? convertedJsonlFile : file;
    
    if (!fileToUpload) {
      toast.error("No valid file to upload. Please convert Excel file first.");
      return;
    }

    setIsUploading(true);
    toast.info("Uploading dataset...");
    
    try {
      // Create form data for the external API
      const formData = new FormData();
      formData.append("purpose", "evals");
      formData.append("file", fileToUpload);
      
      // Call the external API
      const response = await fetch("http://localhost:8080/v1/files", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      toast.success(`${fileToUpload.name} uploaded successfully!`);
      
      // Redirect to dataset library
      navigate("/datasets");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadConvertedFile = () => {
    if (!convertedJsonlFile) return;
    
    const url = URL.createObjectURL(convertedJsonlFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = convertedJsonlFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer
      title="Upload Dataset"
      description="Upload your conversation dataset for analysis"
    >
      <div className="grid gap-8 max-w-4xl mx-auto">
        <Tabs defaultValue="upload" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-6">
            <TabsTrigger value="upload">Upload Dataset</TabsTrigger>
            <TabsTrigger value="format">File Format Guide</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-6">
            <Card className="p-6">
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center ${
                  isDragging ? "border-primary bg-primary/5" : "border-muted"
                } ${file ? "border-success/50" : ""} transition-colors`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={(e) => {
                  // Only open file dialog if clicking directly on the drop area (not its children) or if no file is selected
                  if (e.target === e.currentTarget || !file) {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                  accept=".xlsx,.jsonl"
                />
                
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-success/10 p-3 text-success">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-6 w-6"
                      >
                        <path d="M22 10v6M2 10l10-7 4.37 3.06" />
                        <path d="M14 13.76V6h8v14H9.77" />
                        <path d="M2 14h10v8H2z" />
                      </svg>
                    </div>
                    <div className="text-lg font-medium mt-2">{file.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setJsonlData([]);
                        setConvertedJsonlFile(null);
                        // Reset the file input value
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                        // Prevent the parent container's onClick from firing
                        e.preventDefault();
                      }}
                    >
                      Change file
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-secondary p-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-6 w-6"
                      >
                        <path d="M9 10V5l-7 7 7 7v-5" />
                        <path d="M4 12h13" />
                        <path d="M15 18v-3a4 4 0 0 1 4-4h.5" />
                      </svg>
                    </div>
                    <div className="text-lg font-medium mt-2">
                      Drag & drop file or click to browse
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Supported formats: Excel (.xlsx), JSONL (.jsonl)
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Excel files will be automatically converted to JSONL format with English translation
                    </div>
                  </div>
                )}
              </div>

              {isConverting && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Conversion Progress</h3>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div 
                      className="bg-primary h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${conversionProgress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <div>Reading Excel data</div>
                    <div>Translating text</div>
                    <div>Writing JSONL</div>
                  </div>
                </div>
              )}
              
              {jsonlData.length > 0 && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-medium">JSONL Content ({jsonlData.length} items)</h3>
                    {convertedJsonlFile && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={downloadConvertedFile}
                      >
                        Download JSONL
                      </Button>
                    )}
                  </div>
                  <div className="border rounded-md bg-muted">
                    <div 
                      className="overflow-y-auto p-4" 
                      style={{ 
                        maxHeight: 'calc(75vh)', 
                        maxWidth: '100%'
                      }}
                    >
                      {jsonlData.slice(0, 20).map((item, index) => (
                        <pre 
                          key={index} 
                          className="text-xs mb-2 p-2 bg-accent rounded whitespace-pre-wrap break-all"
                        >
                          {JSON.stringify(item, null, 2)}
                        </pre>
                      ))}
                      {jsonlData.length > 20 && (
                        <div className="text-center text-sm text-muted-foreground mt-2">
                          Showing 20 of {jsonlData.length} items
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
            
            <Button 
              onClick={handleUpload} 
              className="w-full max-w-xs mx-auto" 
              disabled={isUploading || isConverting || (!file) || (file.name.endsWith('.xlsx') && !convertedJsonlFile)}
            >
              {isUploading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" /> 
                  Uploading to External API...
                </>
              ) : (
                "Upload Dataset"
              )}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center">
              {file?.name.endsWith('.xlsx') && !convertedJsonlFile
                ? "Converting your Excel file to JSONL format with English translation..."
                : convertedJsonlFile
                  ? "Your file has been converted to JSONL format and is ready to upload"
                  : file?.name.endsWith('.jsonl')
                    ? "Your JSONL file is ready to upload"
                    : "Select a file to upload"}
            </p>
          </TabsContent>
          
          <TabsContent value="format" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">File Format Requirements</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Excel Format (.xlsx)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    If you're uploading an Excel file, it should contain the following columns:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><span className="font-medium">conversationId</span> - A unique identifier for each conversation</li>
                    <li><span className="font-medium">conversation</span> - The full text of the conversation</li>
                    <li><span className="font-medium">Agent</span> (optional) - The name or ID of the agent involved</li>
                    <li><span className="font-medium">timestamp</span> (optional) - When the conversation occurred</li>
                    <li><span className="font-medium">source_intent</span> (optional) - The initial intent or category</li>
                  </ul>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-lg font-medium mb-2">JSONL Format (.jsonl)</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Each line in your JSONL file should be a valid JSON object with the following structure:
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
{`{
  "item": {
    "conversationId": 1001,
    "conversation": "Customer: I need help\\nAgent: How can I assist you today?",
    "Agent": "GPT-4",
    "timestamp": "2023-01-15T14:30:00Z",
    "source_intent": "general_inquiry"
  }
}`}
                  </pre>
                  <p className="text-sm mt-2 text-muted-foreground">
                    The <span className="font-medium">conversationId</span> and <span className="font-medium">conversation</span> fields are required, others are optional.
                  </p>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Automatic Conversion</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    When you upload an Excel file, our system will:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Read your Excel file and extract the data</li>
                    <li>Translate any non-English text to English (using Google Translate API)</li>
                    <li>Format the data according to the required JSONL structure</li>
                    <li>Create a new JSONL file that will be used for analysis</li>
                  </ol>
                  <p className="text-sm mt-2 text-muted-foreground">
                    This process ensures compatibility with our evaluation system while preserving your original data.
                  </p>
                </div>
              </div>
            </Card>
            
            <Button 
              variant="outline"
              onClick={() => setActiveTab("upload")}
              className="mx-auto block"
            >
              Return to Upload
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
