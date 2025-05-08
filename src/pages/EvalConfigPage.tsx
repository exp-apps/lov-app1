import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createEval, getDatasets, getFileContent } from "@/lib/api";
import { toast } from "sonner";
import { Loader, FileJson, Edit, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Define a type that matches the Dataset type in the API
interface Dataset {
  id: string;
  fileName: string;
  rowCount: number;
  language: string;
  createdAt: string;
  status: "processing" | "ready";
}

// Default taxonomy prompt
const DEFAULT_TAXONOMY_PROMPT = `You are **HandoverJudgeGPT**, an expert in labeling chat transcripts according to a two-level handover taxonomy.  

Below are the definitions and examples for each Level-1 bucket and its allowed Level-2 sub-codes:

1. **CONTEXT_CARRYOVER_FAIL**  
   • Definition: Required context was never obtained after at least one reprompt.  
   • Sub-codes:  
     – **MISSING_INFO_FOR_CONTEXT**: Assistant asked for a info but never recieved from user.  
     – **MULTI_TOPIC_SWITCH**: User changed topic before filling a required slot (e.g. "I need my balance… actually block my card.").

2. **CONTENT_GAP**  
   • Definition: Assistant produced an answer but the user indicates it did not solve their need.  
   • Sub-codes:  
     – **NO_KB_ARTICLE**: Knowledge base lookup failed (e.g. Assistant: "Sorry, I don't know.").  
     – **POLICY_BLOCK**: Bot refuses due to policy (e.g. "Cannot share retention rules.").  
     – **API_404**: Upstream API returned "not found" (e.g. "Account ID not found.").

3. **USER_ESCALATION**  
   • Definition: User explicitly requests a human or conversation turns hostile.  
   • Sub-codes:  
     – **EXPLICIT_ESCALATE**: User says "human", "agent", etc. (e.g. "Give me a real person.").  
     – **NEGATIVE_SENTIMENT**: User gives thumbs-down or uses strongly negative language.  
     – **ABUSIVE_LANGUAGE**: User uses profanity or slurs.

4. **SYSTEM_ERROR**  
   • Definition: Technical failure prevents the bot from replying correctly or on time.  
   • Sub-codes:  
     – **TIMEOUT_KB**: Knowledge base query exceeded SLA (e.g. silence >5 s).  
     – **DEPENDENCY_503**: Upstream service returned 503.  
     – **RATE_LIMIT_HIT**: Upstream returns 429 "Too Many Requests."

**When you receive a chat transcript, identify exactly one Level-1 and one Level-2 code.**  
** Also return the label_selection_reason, why a particular Level-1 and Level-2 code was chosen.

**Output** _only_ valid JSON matching this schema (no extra fields, comments, or text):  
\`\`\`json
{
  "conversationId": "string", 
  "conversation": "string",
  "handover_reason_l1": "string",  
  "handover_reason_l2": "string",
  "label_selection_reason": "string"
  "sourceIntent": "string",
  "agent": "string"
}
\`\`\`
Make sure:
	•	handover_reason_l1 is one of [NLU_LOW_CONFIDENCE, CONTEXT_CARRYOVER_FAIL, CONTENT_GAP, USER_ESCALATION, SYSTEM_ERROR].
	•	handover_reason_l2 is one of the corresponding sub-codes listed above.
	•	Do not wrap your output in markdown or backticks—return raw JSON only.`;

// Parse available models from environment variable
const parseAvailableModels = (): { value: string; label: string }[] => {
  const modelsEnv = import.meta.env.VITE_EVAL_MODELS || "";
  return modelsEnv ? modelsEnv.split(',')
    .filter(model => model.trim().length > 0) // Filter out empty strings
    .map(model => {
      const trimmedModel = model.trim();
      return {
        value: trimmedModel,
        label: trimmedModel
      };
    }) : [];
};

// Available models for evaluation
const AVAILABLE_MODELS = parseAvailableModels();

export default function EvalConfigPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const preselectedDatasetId = queryParams.get('datasetId') || "";

  const [evalName, setEvalName] = useState("Agent Handovers Taxonomy Labelling");
  const [selectedDatasetId, setSelectedDatasetId] = useState(preselectedDatasetId);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingMoreDatasets, setLoadingMoreDatasets] = useState(false);
  const [hasMoreDatasets, setHasMoreDatasets] = useState(true);
  const [lastDatasetId, setLastDatasetId] = useState<string | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS.length > 0 ? AVAILABLE_MODELS[0].value : "");
  const [selectedTemplate] = useState("handover-taxonomy");
  const [promptText, setPromptText] = useState(DEFAULT_TAXONOMY_PROMPT);
  const [promptEditable, setPromptEditable] = useState(false);
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [datasetSelectorOpen, setDatasetSelectorOpen] = useState(false);
  const [loadingSampleData, setLoadingSampleData] = useState(false);
  const [sampleData, setSampleData] = useState<any[]>([]);
  
  // Load more datasets
  const loadMoreDatasets = useCallback(async () => {
    // Check conditions
    if (!hasMoreDatasets || loadingMoreDatasets) {
      console.log("Skipping load more:", { hasMoreDatasets, loadingMoreDatasets });
      return;
    }
    
    if (!lastDatasetId) {
      console.error("Cannot load more: missing lastDatasetId");
      return;
    }
    
    try {
      // Set loading state
      setLoadingMoreDatasets(true);
      console.log(`Loading more datasets after ID: ${lastDatasetId}`);
      
      // Make API call
      const moreDatasets = await getDatasets(lastDatasetId);
      console.log(`Loaded ${moreDatasets.length} more datasets`);
      
      if (moreDatasets.length > 0) {
        // Add new datasets to the existing list
        setDatasets(prev => [...prev, ...moreDatasets]);
        
        // Update the last dataset ID for next pagination
        const newLastDataset = moreDatasets[moreDatasets.length - 1];
        setLastDatasetId(newLastDataset.id);
        console.log(`New last dataset ID: ${newLastDataset.id}`);
        
        // Check if we have reached the end of the list
        const hasMore = moreDatasets.length === 8; // Assuming limit is 8
        setHasMoreDatasets(hasMore);
        
        if (!hasMore) {
          console.log("No more datasets available");
        }
      } else {
        // No more datasets
        setHasMoreDatasets(false);
        console.log("No more datasets returned from API");
      }
    } catch (error) {
      console.error("Failed to load more datasets:", error);
      toast.error("Failed to load more datasets");
    } finally {
      // Clear loading state
      setLoadingMoreDatasets(false);
    }
  }, [hasMoreDatasets, loadingMoreDatasets, lastDatasetId]);

  // Initial data load
  useEffect(() => {
    const fetchDatasets = async () => {
      setLoadingDatasets(true);
      try {
        const data = await getDatasets();
        setDatasets(data);
        
        // Set the last dataset ID for pagination
        if (data.length > 0) {
          const lastDataset = data[data.length - 1];
          setLastDatasetId(lastDataset.id);
        }
        
        // Check if we have reached the end of the list
        setHasMoreDatasets(data.length === 8); // Assuming limit is 8
        
        // If we have a preselected dataset, set it as the selected dataset
        if (preselectedDatasetId) {
          const dataset = data.find(d => d.id === preselectedDatasetId);
          if (dataset) {
            setSelectedDataset(dataset);
            await loadSampleDataForDataset(dataset.id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch datasets:", error);
        toast.error("Failed to load datasets. Please try again.");
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, [preselectedDatasetId]);
  
  // Ensure selectedModel is valid
  useEffect(() => {
    if (AVAILABLE_MODELS.length > 0) {
      if (!selectedModel || !AVAILABLE_MODELS.some(model => model.value === selectedModel)) {
        // If current model is not in the available models, set to first available model
        setSelectedModel(AVAILABLE_MODELS[0].value);
      }
    }
  }, [selectedModel]);

  // Setup intersection observer for dataset selection infinite scrolling
  useEffect(() => {
    // Only set up the observer when the dialog is open and we have more data to load
    if (!datasetSelectorOpen || !hasMoreDatasets || loadingDatasets) return;
    
    // Clear any existing timeout to prevent stale observers
    const timeoutId = setTimeout(() => {
      const loaderElement = datasetLoaderRef.current;
      if (!loaderElement) {
        console.log("Loader element not found");
        return;
      }
      
      console.log("Setting up intersection observer");
      
      const options = {
        root: null,
        rootMargin: "200px", // Much larger margin to detect sooner
        threshold: 0
      };
      
      const observer = new IntersectionObserver((entries) => {
        const [entry] = entries;
        console.log("Intersection detected, isIntersecting:", entry.isIntersecting);
        
        if (entry.isIntersecting && hasMoreDatasets && !loadingMoreDatasets) {
          console.log("Triggering load more datasets");
          loadMoreDatasets();
        }
      }, options);
      
      observer.observe(loaderElement);
      console.log("Observer attached to loader element");
      
      return () => {
        console.log("Cleaning up observer");
        observer.unobserve(loaderElement);
        observer.disconnect();
      };
    }, 300); // Small delay to ensure DOM is ready
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [datasetSelectorOpen, hasMoreDatasets, loadingMoreDatasets, loadingDatasets, loadMoreDatasets]);

  // Manually trigger load more when scrolled near bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMoreDatasets || !hasMoreDatasets) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;
    
    // If scrolled within 200px of the bottom, load more
    if (scrollBottom < 200) {
      console.log("Manual scroll trigger, loading more...");
      loadMoreDatasets();
    }
  }, [loadingMoreDatasets, hasMoreDatasets, loadMoreDatasets]);

  // Load sample data for a dataset to extract field names
  const loadSampleDataForDataset = async (datasetId: string) => {
    if (!datasetId) {
      console.error("No datasetId provided to loadSampleDataForDataset");
      toast.error("Invalid dataset ID");
      return;
    }
    
    console.log(`Loading sample data for dataset ID: "${datasetId}"`);
    setLoadingSampleData(true);
    
    try {
      // Ensure we're using the correct dataset ID
      console.log(`About to call getFileContent with ID: "${datasetId}"`);
      const content = await getFileContent(datasetId);
      console.log(`Received ${content.length} sample data records`);
      setSampleData(content);
      
      if (content.length > 0) {
        // Extract fields from the first item
        const fields = extractFieldPaths(content[0]);
        console.log(`Extracted ${fields.length} fields from sample data`);
        setAvailableFields(fields);
        
        // Clear any existing mapping when selecting a new dataset
        setVariableMapping({});
      } else {
        console.warn("No content received for dataset");
      }
    } catch (error) {
      console.error("Failed to load sample data:", error);
      toast.error("Failed to load dataset sample. Variable mapping may not be available.");
    } finally {
      setLoadingSampleData(false);
    }
  };
  
  const handleSelectDataset = async (dataset: Dataset) => {
    console.log(`Selected dataset: "${dataset.id}" (${dataset.fileName})`);
    
    // Ensure dataset has a valid ID
    if (!dataset.id) {
      console.error("Selected dataset is missing ID:", dataset);
      toast.error("Invalid dataset selected");
      return;
    }
    
    setSelectedDataset(dataset);
    setSelectedDatasetId(dataset.id);
    setDatasetSelectorOpen(false);
    
    // Pass the dataset ID to load sample data
    await loadSampleDataForDataset(dataset.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDatasetId) {
      toast.error("Please select a dataset");
      return;
    }
    
    if (!evalName.trim()) {
      toast.error("Please enter an evaluation name");
      return;
    }
    
    if (!selectedModel) {
      toast.error("Please select a model");
      return;
    }
    
    if (AVAILABLE_MODELS.length === 0) {
      toast.error("No models available. Please check your environment configuration.");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await createEval(
        evalName,
        selectedModel,
        selectedDatasetId,
        selectedTemplate,
        variableMapping,
        promptText
      );
      
      toast.success("Evaluation created successfully");
      
      // Redirect to evaluations listing page
      navigate("/evals");
    } catch (error) {
      console.error("Failed to create evaluation:", error);
      toast.error("Failed to create evaluation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Add variable to mapping
  const addVariableToMapping = (fieldPath: string) => {
    const fieldDisplay = fieldPath.split('.').pop() || fieldPath;
    setVariableMapping(prev => ({
      ...prev,
      [fieldDisplay]: `{{${fieldPath}}}`
    }));
  };
  
  // Remove variable from mapping
  const removeVariableFromMapping = (key: string) => {
    setVariableMapping(prev => {
      const newMapping = {...prev};
      delete newMapping[key];
      return newMapping;
    });
  };

  // Toggle prompt editability
  const togglePromptEdit = () => {
    setPromptEditable(!promptEditable);
  };

  // Refs for intersection observer
  const datasetLoaderRef = useRef<HTMLDivElement>(null);

  // Extract field paths from a JSON object
  const extractFieldPaths = (obj: any, parentPath: string = ''): string[] => {
    if (!obj || typeof obj !== 'object') return [];
    
    return Object.entries(obj).flatMap(([key, value]) => {
      const currentPath = parentPath ? `${parentPath}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return extractFieldPaths(value, currentPath);
      }
      
      return [currentPath];
    });
  };

  return (
    <PageContainer
      title="New Evaluation"
      description="Set up a new evaluation configuration"
    >
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Evaluation Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dataset Selection - Shown as link at the top */}
              <div className="p-4 border rounded-md mb-4 bg-muted/30">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-medium">Dataset</h3>
                    {selectedDataset ? (
                      <div className="flex items-center gap-2 mt-1">
                        <FileJson className="h-4 w-4" />
                        <span>{selectedDataset.fileName}</span>
                        <Badge variant="outline">{selectedDataset.rowCount.toLocaleString()} rows</Badge>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No dataset selected</p>
                    )}
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDatasetSelectorOpen(true)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Change
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="eval-name">Evaluation Name</Label>
                <Input
                  id="eval-name"
                  value={evalName}
                  onChange={(e) => setEvalName(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  A descriptive name to identify this evaluation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                {AVAILABLE_MODELS.length > 0 ? (
                  <Select
                    value={selectedModel}
                    onValueChange={(value) => setSelectedModel(value)}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_MODELS.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-3 border rounded-md text-muted-foreground">
                    No models available. Please check your environment configuration.
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  The model to use for this evaluation (Available: {AVAILABLE_MODELS.length})
                </p>
              </div>

              <div className="space-y-4">
                <Label>Map Dataset Fields</Label>
                
                {loadingSampleData ? (
                  <div className="flex items-center gap-2 p-4 bg-muted rounded-md">
                    <Loader className="h-4 w-4 animate-spin" />
                    <span>Loading dataset fields...</span>
                  </div>
                ) : availableFields.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(variableMapping).map(([key, value]) => (
                        <Badge 
                          key={key} 
                          variant="secondary"
                          className="flex items-center gap-1 py-1 px-2"
                        >
                          <span>{key}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1"
                            onClick={() => removeVariableFromMapping(key)}
                          >
                            ×
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select onValueChange={addVariableToMapping}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Add field" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFields.map(field => (
                            <SelectItem key={field} value={field}>
                              {field.split('.').pop()} ({field})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select dataset fields to map into your evaluation
                    </p>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      {selectedDataset 
                        ? "Could not load fields from dataset. Please select a different dataset." 
                        : "Please select a dataset to see available fields."}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="prompt">Taxonomy Prompt</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={togglePromptEdit}
                    className="flex items-center gap-1"
                  >
                    {promptEditable ? (
                      <>
                        <Lock className="h-4 w-4" /> Lock
                      </>
                    ) : (
                      <>
                        <Unlock className="h-4 w-4" /> Edit
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="prompt"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="font-mono text-sm h-60"
                  readOnly={!promptEditable}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader className="mr-2 h-4 w-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    "Create Evaluation"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      
      {/* Dataset Selection Dialog */}
      <Dialog open={datasetSelectorOpen} onOpenChange={setDatasetSelectorOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Select Dataset</DialogTitle>
          </DialogHeader>
          <div className="px-6 pt-2 pb-6 h-[75vh] flex flex-col">
            {loadingDatasets && datasets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-2">
                  <Loader className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-center text-sm text-muted-foreground">
                    Loading datasets...
                  </p>
                </div>
              </div>
            ) : datasets.length > 0 ? (
              <div 
                className="overflow-y-auto flex-1 pr-1" 
                style={{ 
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'var(--border) transparent' 
                }}
                onScroll={handleScroll}
              >
                <div className="space-y-2 pb-2">
                  {datasets.map((dataset) => (
                    <div
                      key={dataset.id}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-muted cursor-pointer"
                      onClick={() => handleSelectDataset(dataset)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileJson className="h-4 w-4 flex-shrink-0" />
                        <div className="overflow-hidden">
                          <p className="font-medium truncate">{dataset.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {dataset.rowCount.toLocaleString()} rows • {new Date(dataset.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant={dataset.status === "ready" ? "default" : "outline"}
                        className="ml-2 flex-shrink-0"
                      >
                        {dataset.status === "ready" ? "Ready" : "Processing"}
                      </Badge>
                    </div>
                  ))}
                </div>
                
                {/* Infinite scroll loader - moved to be always visible */}
                <div
                  ref={datasetLoaderRef}
                  className="py-6 flex items-center justify-center border-t mt-4"
                >
                  {loadingMoreDatasets ? (
                    <div className="flex items-center gap-2">
                      <Loader className="h-5 w-5 animate-spin" />
                      <span className="text-sm font-medium">Loading more datasets...</span>
                    </div>
                  ) : hasMoreDatasets ? (
                    <div className="text-sm font-medium text-primary">
                      Scroll for more datasets
                    </div>
                  ) : datasets.length > 8 ? (
                    <div className="text-sm text-muted-foreground">
                      All datasets loaded
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">No datasets found.</p>
                  <Button 
                    variant="outline" 
                    className="mt-2"
                    onClick={() => {
                      setDatasetSelectorOpen(false);
                      navigate("/upload");
                    }}
                  >
                    Upload a Dataset
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
