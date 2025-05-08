import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createRun, getEvaluationDetails, getDatasets } from "@/lib/api";
import { toast } from "sonner";
import { Loader, FileJson, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Define Dataset interface
interface Dataset {
  id: string;
  fileName: string;
  rowCount: number;
  language: string;
  createdAt: string;
  status: "processing" | "ready";
}

export default function ConfigureRunPage() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  
  const [runName, setRunName] = useState("Agent Handovers Taxonomy Labelling Run");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState("");
  const [evalName, setEvalName] = useState("");
  
  // Dataset selection state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [datasetSelectorOpen, setDatasetSelectorOpen] = useState(false);
  const [loadingMoreDatasets, setLoadingMoreDatasets] = useState(false);
  const [hasMoreDatasets, setHasMoreDatasets] = useState(true);
  const [lastDatasetId, setLastDatasetId] = useState<string | undefined>(undefined);
  
  // Ref for intersection observer
  const datasetLoaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch evaluation details to get the dataset ID
    const fetchEvalDetails = async () => {
      if (!evalId) return;
      
      try {
        setIsLoading(true);
        const details = await getEvaluationDetails(evalId);
        setEvalName(details.name);
        
        // Set dataset ID if found in the evaluation details
        if (details.data_source_config?.metadata?.dataset_id) {
          setDatasetId(details.data_source_config.metadata.dataset_id);
          
          // Try to find dataset details
          await fetchDatasets();
        }
      } catch (error) {
        console.error("Failed to fetch evaluation details:", error);
        toast.error("Failed to load evaluation details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEvalDetails();
  }, [evalId]);
  
  // Fetch datasets
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
      
      // If we have a datasetId, find and set the selected dataset
      if (datasetId) {
        const dataset = data.find(d => d.id === datasetId);
        if (dataset) {
          setSelectedDataset(dataset);
        }
      }
    } catch (error) {
      console.error("Failed to fetch datasets:", error);
      toast.error("Failed to load datasets. Please try again.");
    } finally {
      setLoadingDatasets(false);
    }
  };
  
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
      } else {
        // No more datasets
        setHasMoreDatasets(false);
      }
    } catch (error) {
      console.error("Failed to load more datasets:", error);
      toast.error("Failed to load more datasets");
    } finally {
      // Clear loading state
      setLoadingMoreDatasets(false);
    }
  }, [hasMoreDatasets, loadingMoreDatasets, lastDatasetId]);
  
  // Setup intersection observer for infinite scrolling
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
        
        if (entry.isIntersecting && hasMoreDatasets && !loadingMoreDatasets) {
          console.log("Triggering load more datasets");
          loadMoreDatasets();
        }
      }, options);
      
      observer.observe(loaderElement);
      
      return () => {
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
  
  const handleSelectDataset = (dataset: Dataset) => {
    console.log(`Selected dataset: "${dataset.id}" (${dataset.fileName})`);
    
    // Ensure dataset has a valid ID
    if (!dataset.id) {
      console.error("Selected dataset is missing ID:", dataset);
      toast.error("Invalid dataset selected");
      return;
    }
    
    setSelectedDataset(dataset);
    setDatasetId(dataset.id);
    setDatasetSelectorOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!evalId) {
      toast.error("Missing evaluation ID");
      return;
    }
    
    if (!runName.trim()) {
      toast.error("Please enter a run name");
      return;
    }
    
    if (!datasetId) {
      toast.error("Please select a dataset");
      return;
    }

    setIsSubmitting(true);
    try {
      // Call the real API to create a run
      const runData = await createRun(evalId, runName, datasetId);
      toast.success("Run started successfully!");
      
      // Store evalId and runId in localStorage for the RunMonitorPage
      localStorage.setItem("lastRunEvalId", evalId);
      localStorage.setItem("lastRunId", runData.id);
      
      // Navigate to run monitor page
      navigate(`/runs/${runData.id}`);
    } catch (error) {
      console.error("Failed to start run:", error);
      toast.error("Failed to start run. Please check your API key and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Start Run"
      description={`Start a new run for "${evalName}"`}
    >
      <div className="max-w-2xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="h-6 w-6 animate-spin mr-2" />
                <span>Loading evaluation details...</span>
              </div>
            ) : (
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
                      onClick={() => {
                        fetchDatasets(); // Ensure datasets are loaded
                        setDatasetSelectorOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {selectedDataset ? "Change" : "Select"}
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="run-name">Run Name</Label>
                  <Input
                    id="run-name"
                    value={runName}
                    onChange={(e) => setRunName(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={isSubmitting || !datasetId}>
                    {isSubmitting ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" /> Starting Run...
                      </>
                    ) : (
                      "Start Run"
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
            )}
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
                
                {/* Infinite scroll loader */}
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
