import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDatasets, getFileContent, Dataset } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader, X, FileJson } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

export default function DatasetLibraryPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastFileId, setLastFileId] = useState<string | undefined>(undefined);
  
  // Preview state
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  const navigate = useNavigate();
  
  // Observer for infinite scrolling
  const loaderRef = useRef<HTMLDivElement>(null);
  
  // Intersection observer callback
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loadingMore && !loading) {
        loadMoreDatasets();
      }
    },
    [hasMore, loadingMore, loading]
  );
  
  // Set up the intersection observer
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    };
    
    const observer = new IntersectionObserver(handleObserver, options);
    const currentLoader = loaderRef.current;
    
    if (currentLoader) {
      observer.observe(currentLoader);
    }
    
    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
      observer.disconnect();
    };
  }, [handleObserver]);

  // Initial data load
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setLoading(true);
        const data = await getDatasets();
        setDatasets(data);
        
        // Set the last file ID for pagination
        if (data.length > 0) {
          const lastDataset = data[data.length - 1];
          setLastFileId(lastDataset.id);
        }
        
        // Check if we have reached the end of the list
        setHasMore(data.length === 8); // Assuming limit is 8
      } catch (error) {
        console.error("Failed to fetch datasets:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDatasets();
  }, []);

  // Load more datasets when scrolling
  const loadMoreDatasets = async () => {
    if (!hasMore || loadingMore || !lastFileId) return;
    
    try {
      setLoadingMore(true);
      
      const moreDatasets = await getDatasets(lastFileId);
      
      if (moreDatasets.length > 0) {
        // Add new datasets to the existing list
        setDatasets((prev) => [...prev, ...moreDatasets]);
        
        // Update the last file ID for next pagination
        const newLastDataset = moreDatasets[moreDatasets.length - 1];
        setLastFileId(newLastDataset.id);
      }
      
      // Check if we have reached the end of the list
      setHasMore(moreDatasets.length === 8); // Assuming limit is 8
    } catch (error) {
      console.error("Failed to load more datasets:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Handle dataset row click to show preview
  const handleDatasetClick = async (dataset: Dataset) => {
    setSelectedDataset(dataset);
    setPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewData([]);
    
    try {
      const content = await getFileContent(dataset.id);
      setPreviewData(content);
    } catch (error) {
      console.error("Failed to load dataset content:", error);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Filter datasets based on search term
  const filteredDatasets = datasets.filter(
    (dataset) =>
      dataset.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dataset.language.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleCreateEval = (e: React.MouseEvent, datasetId: string) => {
    e.stopPropagation(); // Prevent row click from triggering
    navigate(`/evals/new?datasetId=${datasetId}`);
  };

  return (
    <PageContainer
      title="Dataset Library"
      description="Manage your uploaded conversation datasets"
    >
      <div className="flex items-center gap-4 mb-6">
        <Input
          placeholder="Search datasets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button asChild className="ml-auto">
          <a href="/upload">Upload New Dataset</a>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">File Name</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDatasets.length > 0 ? (
                filteredDatasets.map((dataset) => (
                  <TableRow 
                    key={dataset.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleDatasetClick(dataset)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-muted-foreground" />
                        {dataset.fileName}
                      </div>
                    </TableCell>
                    <TableCell>{dataset.language}</TableCell>
                    <TableCell>{formatDate(dataset.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={dataset.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleCreateEval(e, dataset.id)}
                        disabled={dataset.status !== "ready"}
                      >
                        {dataset.status === "ready" ? "Create Eval" : "Processing..."}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No datasets found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          {/* Intersection observer target for infinite scrolling */}
          {!searchTerm && hasMore && (
            <div
              ref={loaderRef}
              className="w-full h-20 flex items-center justify-center"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading more datasets...</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Scroll down to load more datasets
                </div>
              )}
            </div>
          )}
          
          {/* End of list message */}
          {!hasMore && datasets.length > 0 && !loadingMore && (
            <div className="w-full py-4 text-center text-sm text-muted-foreground">
              End of dataset list
            </div>
          )}
        </div>
      )}

      {/* Content Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                {selectedDataset?.fileName}
              </div>
              <DialogClose className="rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </DialogTitle>
          </DialogHeader>
          
          {loadingPreview ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading file content...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden border rounded-md bg-muted">
              <div 
                className="overflow-y-auto p-4" 
                style={{ 
                  height: 'calc(75vh - 100px)', 
                  maxWidth: '100%'
                }}
              >
                {previewData.length > 0 ? (
                  <>
                    {previewData.slice(0, 20).map((item, index) => (
                      <pre 
                        key={index} 
                        className="text-xs mb-2 p-2 bg-accent rounded whitespace-pre-wrap break-all"
                      >
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    ))}
                    {previewData.length > 20 && (
                      <div className="text-center text-sm text-muted-foreground mt-2">
                        Showing 20 of {previewData.length} items
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No content to display</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
