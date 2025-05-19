import { useState, useEffect, useRef, RefObject } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  getGenericLabels, 
  getDomainLabelSuggestions, 
  acceptDomainLabel,
  getDomainLabels,
  getDomainLabelAggregation,
  getConversationTranscripts,
  GenericLabel, 
  DomainLabelSuggestion,
  SuggestedLabel,
  ClusterData,
  DomainLabelRule,
  DomainLabelCategory,
  DomainLabelBucket,
  Conversation,
  Message
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Loader, InfoIcon, CheckCircle, Calendar, User, ChevronRight, ChevronDown, 
  BarChart, PieChart, MessageSquare, X, Clock, Download
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PieChart as RechartsPC, Pie, ResponsiveContainer, Cell, Legend, Tooltip as ChartTooltip, BarChart as RechartsBC, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";

// Hard-coded email for attribution
const AUTHOR_EMAIL = "jb@masaic.ai";

// Parse available models from environment variable
const parseAvailableModels = (): string[] => {
  const modelsEnv = import.meta.env.VITE_EVAL_MODELS || "";
  
  // Return empty array if no models are defined
  if (!modelsEnv) {
    return [];
  }
  
  // Return the raw model strings without any formatting
  return modelsEnv.split(',')
    .filter(model => model.trim().length > 0) // Filter out empty strings
    .map(model => model.trim());
};

// Available models for domain labelling
const AVAILABLE_MODELS = parseAvailableModels();

// Function to get confidence color based on confidence value
const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.7) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (confidence >= 0.4) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
};

// Function to get confidence text based on confidence value
const getConfidenceText = (confidence: number) => {
  if (confidence >= 0.7) return "HIGH";
  if (confidence >= 0.4) return "MEDIUM";
  return "LOW";
};

// Generate random colors for chart segments
const getChartColors = (count: number): string[] => {
  const baseColors = [
    '#3498db', '#2ecc71', '#f1c40f', '#e74c3c', '#9b59b6', 
    '#1abc9c', '#d35400', '#34495e', '#16a085', '#27ae60',
    '#f39c12', '#c0392b', '#8e44ad', '#2c3e50', '#7f8c8d'
  ];
  
  // If we have more items than base colors, generate additional colors
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }
  
  // Generate additional random colors
  const colors = [...baseColors];
  for (let i = baseColors.length; i < count; i++) {
    const r = Math.floor(Math.random() * 200);
    const g = Math.floor(Math.random() * 200);
    const b = Math.floor(Math.random() * 200);
    colors.push(`rgb(${r}, ${g}, ${b})`);
  }
  
  return colors;
};

// Format date from API (YYYY-MM-DD) to more readable format (MMM DD)
const formatChartDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Utility function to get integer ticks for Y axis
const getIntegerTicks = (data: {count: number}[]): number[] => {
  if (!data || data.length === 0) return [0, 1];
  
  // Get the maximum value
  const maxValue = Math.max(...data.map(item => item.count));
  
  // If max is 0 or 1, return simple scale
  if (maxValue <= 1) return [0, 1];
  
  // For small values (2-5), just return range from 0 to max
  if (maxValue <= 5) {
    return Array.from({length: maxValue + 1}, (_, i) => i);
  }
  
  // For larger values, create a reasonable number of ticks (around 5-6)
  const tickCount = 5;
  const step = Math.ceil(maxValue / (tickCount - 1));
  
  return Array.from({length: tickCount}, (_, i) => i * step);
};

export default function DomainLabellingPage() {
  const [activeTab, setActiveTab] = useState<string>("create");
  const [selectedGenericLabel, setSelectedGenericLabel] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS.length > 0 ? AVAILABLE_MODELS[0] : "");
  const [domainSuggestions, setDomainSuggestions] = useState<DomainLabelSuggestion[]>([]);
  const [genericLabels, setGenericLabels] = useState<GenericLabel[]>([]);
  const [domainLabels, setDomainLabels] = useState<DomainLabelRule[]>([]);
  const [isLoadingGenericLabels, setIsLoadingGenericLabels] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingDomainLabels, setIsLoadingDomainLabels] = useState(false);
  const [genericLabelsError, setGenericLabelsError] = useState<Error | null>(null);
  const [suggestionsError, setSuggestionsError] = useState<Error | null>(null);
  const [domainLabelsError, setDomainLabelsError] = useState<Error | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [isAcceptingLabel, setIsAcceptingLabel] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<DomainLabelSuggestion | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [domainCategories, setDomainCategories] = useState<DomainLabelCategory[]>([]);
  const [isLoadingAggregation, setIsLoadingAggregation] = useState(false);
  const [aggregationError, setAggregationError] = useState<Error | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [chartColors, setChartColors] = useState<string[]>([]);
  const [conversationsModalOpen, setConversationsModalOpen] = useState(false);
  const [currentDomainLabel, setCurrentDomainLabel] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<Error | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [lastConversationId, setLastConversationId] = useState<string | undefined>(undefined);
  const conversationListRef = useRef<HTMLDivElement>(null);

  // Fetch generic labels on component mount
  useEffect(() => {
    async function fetchGenericLabels() {
      setIsLoadingGenericLabels(true);
      setGenericLabelsError(null);
      
      try {
        const data = await getGenericLabels();
        setGenericLabels(data);
      } catch (error) {
        console.error("Error fetching generic labels:", error);
        setGenericLabelsError(error instanceof Error ? error : new Error("Failed to fetch generic labels"));
      } finally {
        setIsLoadingGenericLabels(false);
      }
    }
    
    fetchGenericLabels();
  }, []);

  // Fetch domain labels
  const fetchDomainLabels = async () => {
    setIsLoadingDomainLabels(true);
    setDomainLabelsError(null);
    
    try {
      const data = await getDomainLabels();
      setDomainLabels(data);
    } catch (error) {
      console.error("Error fetching domain labels:", error);
      setDomainLabelsError(error instanceof Error ? error : new Error("Failed to fetch domain labels"));
    } finally {
      setIsLoadingDomainLabels(false);
    }
  };

  // Fetch domain labels when active tab changes to "existing"
  useEffect(() => {
    if (activeTab === "existing") {
      fetchDomainLabels();
    }
  }, [activeTab]);

  // Fetch domain label suggestions
  const fetchDomainSuggestions = async () => {
    if (!selectedGenericLabel) {
      toast.error("Please select a generic label first");
      return;
    }

    if (!selectedModel) {
      toast.error("Please select a model first");
      return;
    }

    setIsLoadingSuggestions(true);
    setSuggestionsError(null);
    setDomainSuggestions([]);
    setSelectedCluster(null);
    
    try {
      // Show a long duration toast for the generation process
      const loadingToast = toast.loading("Generating domain label suggestions. This may take a minute...", {
        duration: 60000, // 1 minute
      });
      
      // Fetch the suggestions
      console.log(`Requesting suggestions for bucket: ${selectedGenericLabel} with model: ${selectedModel}`);
      const result = await getDomainLabelSuggestions(selectedGenericLabel, selectedModel);
      const suggestions = result.suggestions;
      
      // Dismiss the loading toast
      toast.dismiss(loadingToast);
      
      console.log("Domain label suggestions:", suggestions);
      console.log("Raw response:", result.rawResponse);
      
      // Check if we have valid suggestions
      if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
        console.error("Invalid or empty suggestions response:", suggestions);
        toast.error("No valid suggestions received. Try a different generic label or model.");
        return;
      }
      
      // Group suggestions by cluster ID
      const clusterGroups: Record<string, DomainLabelSuggestion[]> = {};
      
      suggestions.forEach(suggestion => {
        if (suggestion.clusterId) {
          if (!clusterGroups[suggestion.clusterId]) {
            clusterGroups[suggestion.clusterId] = [];
          }
          clusterGroups[suggestion.clusterId].push(suggestion);
        }
      });
      
      // If we have clusters, set the first one as selected
      if (Object.keys(clusterGroups).length > 0) {
        setSelectedCluster(Object.keys(clusterGroups)[0]);
      }
      
      setDomainSuggestions(suggestions);
      toast.success(`Generated ${suggestions.length} domain label suggestions in ${Object.keys(clusterGroups).length} clusters`);
    } catch (error) {
      console.error("Error fetching domain suggestions:", error);
      setSuggestionsError(error instanceof Error ? error : new Error("Failed to fetch domain label suggestions"));
      toast.error("Failed to fetch domain label suggestions");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Handle selection of a domain label suggestion
  const handleSelectDomainLabel = (suggestion: DomainLabelSuggestion) => {
    // If this is an existing label, just switch to the "existing" tab
    if (suggestion.existing) {
      setActiveTab("existing");
      fetchDomainLabels();
      return;
    }
    
    console.log("Selected label:", suggestion);
    setSelectedLabel(suggestion);
    setConfirmDialogOpen(true);
  };

  // Handle confirmation of domain label selection
  const handleConfirmLabelSelection = async () => {
    if (!selectedLabel || !selectedCluster || !selectedGenericLabel) {
      toast.error("Missing required data for accepting label");
      return;
    }

    // Log the payload to help debug
    const originalLabel = selectedLabel.originalLabel;
    const originalCluster = selectedLabel.originalCluster;

    if (!originalLabel || !originalCluster) {
      toast.error("Missing required original data. This may be a bug.");
      console.error("Missing original data:", { selectedLabel });
      return;
    }

    console.log("Accept payload:", {
      bucketPath: selectedGenericLabel,
      suggestedLabel: originalLabel,
      cluster: originalCluster,
      author: AUTHOR_EMAIL
    });

    setIsAcceptingLabel(true);
    try {
      // Call the API to accept the label with the hard-coded email
      await acceptDomainLabel(
        selectedGenericLabel,
        originalLabel,
        originalCluster,
        AUTHOR_EMAIL
      );
      
      setConfirmDialogOpen(false);
      toast.success(`Domain label "${selectedLabel.suggestion}" accepted`);
      
      // Switch to the "existing" tab to show all domain labels, including the newly created one
      setActiveTab("existing");
      
      // Refresh the domain labels
      fetchDomainLabels();
    } catch (error) {
      console.error("Error accepting domain label:", error);
      toast.error(`Failed to accept domain label: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAcceptingLabel(false);
    }
  };

  // Format date to readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get suggestions for the currently selected cluster
  const getSelectedClusterSuggestions = () => {
    if (!selectedCluster) return [];
    return domainSuggestions.filter(suggestion => suggestion.clusterId === selectedCluster);
  };

  // Get unique cluster IDs
  const getClusterIds = () => {
    const clusterIds: string[] = [];
    domainSuggestions.forEach(suggestion => {
      if (suggestion.clusterId && !clusterIds.includes(suggestion.clusterId)) {
        clusterIds.push(suggestion.clusterId);
      }
    });
    return clusterIds;
  };

  // Get example conversations for selected cluster
  const getSelectedClusterExamples = () => {
    const suggestions = getSelectedClusterSuggestions();
    if (suggestions.length === 0) return [];
    
    // All suggestions in the same cluster have the same examples
    return suggestions[0]?.examples || [];
  };

  // Group domain labels by their category (level 2)
  const getDomainLabelsByCategory = () => {
    const categories: Record<string, DomainLabelRule[]> = {};
    
    domainLabels.forEach(label => {
      // Parse the label path to get the category
      const parts = label.label.split('/');
      
      // Make sure we have at least 3 parts (domain/category/label)
      if (parts.length >= 3) {
        const category = parts[1]; // The second part is the category
        
        if (!categories[category]) {
          categories[category] = [];
        }
        
        categories[category].push(label);
      } else {
        // For labels that don't follow the expected format, put them in "other"
        const category = 'other';
        
        if (!categories[category]) {
          categories[category] = [];
        }
        
        categories[category].push(label);
      }
    });
    
    return categories;
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Fetch aggregation data for dashboard
  const fetchAggregationData = async () => {
    setIsLoadingAggregation(true);
    setAggregationError(null);
    
    try {
      const data = await getDomainLabelAggregation();
      setDomainCategories(data.domains);
      
      // Generate colors for the chart segments - count total buckets across all domains
      const totalBuckets = data.domains.reduce((sum, domain) => sum + domain.buckets.length, 0);
      setChartColors(getChartColors(totalBuckets + data.domains.length));
      
      // Select the first category by default if available
      if (data.domains.length > 0) {
        setSelectedCategory(data.domains[0].path);
        
        // Select the first bucket in this category if available
        if (data.domains[0].buckets.length > 0) {
          setSelectedBucket(data.domains[0].buckets[0].path);
        }
      }
    } catch (error) {
      console.error("Error fetching domain label aggregation:", error);
      setAggregationError(error instanceof Error ? error : new Error("Failed to fetch domain label aggregation"));
    } finally {
      setIsLoadingAggregation(false);
    }
  };

  // Fetch aggregation data when dashboard tab is selected
  useEffect(() => {
    if (activeTab === "dashboard") {
      fetchAggregationData();
    }
  }, [activeTab]);

  // Get the selected category data
  const getSelectedCategoryData = () => {
    return domainCategories.find(category => category.path === selectedCategory);
  };

  // Get the selected bucket data
  const getSelectedBucketData = () => {
    const category = getSelectedCategoryData();
    if (!category) return null;
    
    return category.buckets.find(bucket => bucket.path === selectedBucket);
  };

  // Get category date-wise data (sum of all buckets in the category)
  const getCategoryDateWiseData = () => {
    const category = getSelectedCategoryData();
    if (!category || !category.dateWise) return [];
    
    return category.dateWise.map(dateItem => ({
      date: formatChartDate(dateItem.day),
      count: dateItem.count,
      rawDate: dateItem.day
    }));
  };

  // Get data for domain category pie chart
  const getDomainCategoriesPieData = () => {
    return domainCategories.map(category => ({
      name: category.path,
      value: category.count,
      fullPath: category.path
    }));
  };

  // Get data for buckets pie chart within selected category
  const getCategoryBucketsPieData = () => {
    const category = getSelectedCategoryData();
    if (!category) return [];
    
    return category.buckets.map(bucket => ({
      name: bucket.path,
      value: bucket.count,
      fullPath: bucket.path,
      completePath: `${category.path}/${bucket.path}`
    }));
  };

  // Get bar chart data for the selected bucket
  const getBarChartData = () => {
    const bucket = getSelectedBucketData();
    if (!bucket) return [];
    
    return bucket.dateWise.map(dateItem => ({
      date: formatChartDate(dateItem.day),
      count: dateItem.count,
      rawDate: dateItem.day
    }));
  };

  // Get the full path of a selected bucket
  const getFullBucketPath = () => {
    if (!selectedCategory || !selectedBucket) return null;
    return `domain/${selectedCategory}/${selectedBucket}`;
  };

  // Open conversation viewer for a domain label
  const openConversationViewer = (category: string, bucket: string) => {
    const fullPath = `domain/${category}/${bucket}`;
    setCurrentDomainLabel(fullPath);
    setConversationsModalOpen(true);
    setConversations([]);
    setSelectedConversation(null);
    setLastConversationId(undefined);
    
    // Load the first batch of conversations
    fetchConversations(fullPath);
  };

  // Fetch conversations for a domain label
  const fetchConversations = async (domainLabel: string, after?: string) => {
    if (!domainLabel) return;
    
    // Debug info
    console.log(`Fetching conversations for ${domainLabel}, after: ${after || 'none'}`);
    
    setIsLoadingConversations(true);
    setConversationsError(null);
    
    try {
      const result = await getConversationTranscripts(domainLabel, 10, after);
      
      console.log(`Fetched ${result.data.length} conversations, has_more: ${result.has_more}`);
      console.log(`Last conversation ID: ${result.last_id}`);
      
      if (after) {
        // Append to existing conversations
        setConversations(prev => [...prev, ...result.data]);
      } else {
        // Replace existing conversations
        setConversations(result.data);
        
        // Select first conversation if available
        if (result.data.length > 0) {
          setSelectedConversation(result.data[0]);
        }
      }
      
      // Store pagination info
      setHasMoreConversations(result.has_more);
      setLastConversationId(result.last_id);
      
    } catch (error) {
      console.error("Error fetching conversations:", error);
      setConversationsError(error instanceof Error ? error : new Error("Failed to fetch conversations"));
      toast.error("Failed to load conversations");
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Handle scroll event to implement infinite scrolling
  const handleConversationListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    
    // Debug info
    console.log(`Scroll detected: hasMore=${hasMoreConversations}, loading=${isLoadingConversations}`);
    console.log(`Last conversation ID: ${lastConversationId}`);
    
    if (!hasMoreConversations || isLoadingConversations) return;
    
    const { scrollTop, scrollHeight, clientHeight } = target;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;
    
    console.log(`Scroll position: ${scrollPosition} (threshold: 200)`);
    
    // If scrolled to bottom (with a larger threshold of 200px)
    if (scrollPosition < 200) {
      console.log("Loading more conversations...");
      if (currentDomainLabel) {
        fetchConversations(currentDomainLabel, lastConversationId);
      }
    }
  };

  // Format message timestamp
  const formatMessageTime = (timestamp?: string) => {
    if (!timestamp) return "";
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (e) {
      return "";
    }
  };

  // Format short date
  const formatShortDate = (dateString?: string) => {
    if (!dateString) return "";
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <PageContainer 
      title="Domain Labelling" 
      description="Generate and select domain label suggestions based on generic labels"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="create">Create Domain Labels</TabsTrigger>
          <TabsTrigger value="existing">Existing Domain Labels</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
        
        <TabsContent value="create" className="space-y-6">
          {/* Generic Labels Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Select Generic Label</CardTitle>
              <CardDescription>
                Choose a generic label category to generate domain label suggestions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {genericLabelsError && (
                  <div className="text-red-500">
                    Error loading generic labels: {genericLabelsError.message}
                  </div>
                )}
                
                {isLoadingGenericLabels ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="generic-label">Generic Label</Label>
                    <Select
                      value={selectedGenericLabel}
                      onValueChange={setSelectedGenericLabel}
                      disabled={isLoadingGenericLabels}
                    >
                      <SelectTrigger id="generic-label" className="w-full">
                        <SelectValue placeholder="Select a generic label" />
                      </SelectTrigger>
                      <SelectContent>
                        {genericLabels.map((label) => (
                          <SelectItem key={label.path} value={label.path}>
                            {label.path} ({label.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="model-select">Model</Label>
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                    disabled={isLoadingSuggestions}
                  >
                    <SelectTrigger id="model-select" className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_MODELS.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button 
                  onClick={fetchDomainSuggestions}
                  disabled={!selectedGenericLabel || !selectedModel || isLoadingSuggestions}
                  className="w-full"
                >
                  {isLoadingSuggestions ? (
                    <span className="flex items-center">
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      Generating Suggestions...
                    </span>
                  ) : "Generate Domain Label Suggestions"}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Loading suggestions */}
          {isLoadingSuggestions && (
            <Card>
              <CardHeader>
                <CardTitle>Generating Suggestions</CardTitle>
                <CardDescription>
                  Please wait while domain labels are being generated. This process can take up to a minute.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-center text-sm text-muted-foreground">
                    The model is analyzing data with the pattern "{selectedGenericLabel}"...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Suggestions error */}
          {!isLoadingSuggestions && suggestionsError && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="text-red-600 dark:text-red-400">Error Generating Suggestions</CardTitle>
                <CardDescription>
                  There was an error generating domain label suggestions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-red-600 dark:text-red-400">
                  {suggestionsError.message}
                </p>
                <Button 
                  onClick={fetchDomainSuggestions}
                  className="mt-4"
                  variant="outline"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Domain Label Suggestions - Cluster Selection */}
          {!isLoadingSuggestions && domainSuggestions.length > 0 && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Select Conversation Cluster</CardTitle>
                  <CardDescription>
                    Review conversation clusters identified in your data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {getClusterIds().map((clusterId) => (
                      <Button
                        key={clusterId}
                        variant={selectedCluster === clusterId ? "default" : "outline"}
                        onClick={() => setSelectedCluster(clusterId)}
                        className="mb-2"
                      >
                        Cluster {clusterId}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Example Conversations */}
              {selectedCluster && (
                <Card>
                  <CardHeader>
                    <CardTitle>Conversation Examples - Cluster {selectedCluster}</CardTitle>
                    <CardDescription>
                      Representative conversations from this cluster
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {getSelectedClusterExamples().map((example, idx) => (
                        <Card key={idx} className="bg-muted/30">
                          <CardContent className="p-4">
                            <p className="text-sm">{example}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Domain Label Suggestions */}
              {selectedCluster && (
                <Card>
                  <CardHeader>
                    <CardTitle>Step 3: Select Domain Label</CardTitle>
                    <CardDescription>
                      Choose a domain label suggestion to create a new domain label rule for Cluster {selectedCluster}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {getSelectedClusterSuggestions().map((suggestion, index) => (
                        <Card 
                          key={index} 
                          className="hover:bg-accent/50 cursor-pointer border-2 border-transparent hover:border-primary/50 transition-all"
                          onClick={() => handleSelectDomainLabel(suggestion)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-lg">{suggestion.suggestion || "Unknown label"}</CardTitle>
                              <Badge className={getConfidenceColor(suggestion.confidence)}>
                                {getConfidenceText(suggestion.confidence)} confidence
                              </Badge>
                            </div>
                            {suggestion.definition && (
                              <CardDescription className="text-sm mt-1">
                                {suggestion.definition}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="pb-2">
                            {suggestion.reason && (
                              <div className="flex items-start mt-1 text-sm bg-muted/30 p-2 rounded">
                                <InfoIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                <p className="text-muted-foreground">{suggestion.reason}</p>
                              </div>
                            )}
                            {suggestion.existing && (
                              <div className="flex items-start mt-2 text-sm bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                                <InfoIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-blue-500" />
                                <p className="text-blue-500 dark:text-blue-400">This label already exists in the system</p>
                              </div>
                            )}
                          </CardContent>
                          <CardFooter className="pt-0">
                            {suggestion.existing ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="ml-auto flex gap-1.5 items-center text-blue-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Switch to the "existing" tab to view all labels
                                  setActiveTab("existing");
                                  // Refresh domain labels to ensure we have the latest data
                                  fetchDomainLabels();
                                }}
                              >
                                <ChevronRight className="h-4 w-4" />
                                View Existing Labels
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="ml-auto flex gap-1.5 items-center text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectDomainLabel(suggestion);
                                }}
                              >
                                <CheckCircle className="h-4 w-4" />
                                Select this label
                              </Button>
                            )}
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
        
        <TabsContent value="existing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Existing Domain Labels</CardTitle>
              <CardDescription>
                View all domain labels grouped by category
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDomainLabels ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : domainLabelsError ? (
                <div className="text-red-500 p-4 bg-red-50 rounded-md">
                  <p className="font-semibold">Error loading domain labels</p>
                  <p>{domainLabelsError.message}</p>
                  <Button onClick={fetchDomainLabels} variant="outline" className="mt-2">
                    Try Again
                  </Button>
                </div>
              ) : domainLabels.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No domain labels have been created yet</p>
                  <Button onClick={() => setActiveTab("create")} className="mt-4">
                    Create Domain Labels
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(getDomainLabelsByCategory()).map(([category, labels]) => (
                    <Collapsible
                      key={category}
                      open={expandedCategories[category]}
                      onOpenChange={() => toggleCategory(category)}
                      className="border rounded-lg"
                    >
                      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 font-medium hover:bg-accent/50 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          {expandedCategories[category] ? 
                            <ChevronDown className="h-4 w-4" /> : 
                            <ChevronRight className="h-4 w-4" />
                          }
                          <span className="capitalize">{category}</span>
                          <Badge variant="outline" className="ml-2">{labels.length}</Badge>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t px-4 py-2">
                        <div className="space-y-4 pt-2">
                          {labels.map((label) => (
                            <Card key={label.id} className="border-l-4 border-l-primary/50">
                              <CardHeader className="pb-2">
                                <div className="flex justify-between flex-col sm:flex-row">
                                  <CardTitle className="text-lg break-all">{label.label}</CardTitle>
                                </div>
                              </CardHeader>
                              <CardContent className="pb-2 space-y-3">
                                {label.definition && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Definition:</p>
                                    <p className="text-sm text-muted-foreground">{label.definition}</p>
                                  </div>
                                )}
                                
                                {label.reason && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Reasoning:</p>
                                    <p className="text-sm text-muted-foreground">{label.reason}</p>
                                  </div>
                                )}
                              </CardContent>
                              <CardFooter className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-0">
                                <div className="flex items-center">
                                  <User className="h-3 w-3 mr-1" />
                                  {label.author}
                                </div>
                                <div className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {formatDate(label.createdAt)}
                                </div>
                                <div className="flex flex-col gap-1 w-full mt-2 pt-2 border-t border-muted">
                                  <div className="flex items-center">
                                    <span className="font-medium mr-1">ID:</span> 
                                    <span className="font-mono text-[10px]">{label.id}</span>
                                  </div>
                                  <div className="flex items-center">
                                    <span className="font-medium mr-1">Source:</span> 
                                    <span className="font-mono text-[10px]">{label.bucketPath}</span>
                                  </div>
                                </div>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={fetchDomainLabels} 
                variant="outline" 
                className="w-full"
                disabled={isLoadingDomainLabels}
              >
                {isLoadingDomainLabels ? (
                  <span className="flex items-center">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </span>
                ) : "Refresh Domain Labels"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="dashboard" className="space-y-6">
          {/* Export Button at the top */}
          <div className="flex justify-end mb-2">
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => window.open('http://localhost:8080/v1/data/export', '_blank')}
            >
              <Download className="h-4 w-4" />
              Export All Labeled Data
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Domain Labels Dashboard</CardTitle>
                  <CardDescription>
                    Analyze distribution and trends in domain label usage
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => window.open('http://localhost:8080/v1/data/export', '_blank')}
                >
                  <Download className="h-4 w-4" />
                  Export Data
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingAggregation ? (
                <div className="space-y-4">
                  <Skeleton className="h-80 w-full" />
                  <Skeleton className="h-60 w-full" />
                </div>
              ) : aggregationError ? (
                <div className="text-red-500 p-4 bg-red-50 rounded-md">
                  <p className="font-semibold">Error loading dashboard data</p>
                  <p>{aggregationError.message}</p>
                  <Button onClick={fetchAggregationData} variant="outline" className="mt-2">
                    Try Again
                  </Button>
                </div>
              ) : domainCategories.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No domain label data available</p>
                  <Button onClick={() => setActiveTab("create")} className="mt-4">
                    Create Domain Labels
                  </Button>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Domain categories pie chart */}
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">Domain Categories Distribution</CardTitle>
                        <PieChart className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <CardDescription>
                        Distribution of domain categories by usage count
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPC>
                            <Pie
                              data={getDomainCategoriesPieData()}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              onClick={(data) => {
                                setSelectedCategory(data.fullPath);
                                // Reset bucket selection
                                const category = domainCategories.find(c => c.path === data.fullPath);
                                if (category && category.buckets.length > 0) {
                                  setSelectedBucket(category.buckets[0].path);
                                } else {
                                  setSelectedBucket(null);
                                }
                              }}
                            >
                              {getDomainCategoriesPieData().map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={chartColors[index % chartColors.length]}
                                  stroke={entry.fullPath === selectedCategory ? "#000" : undefined}
                                  strokeWidth={entry.fullPath === selectedCategory ? 2 : 0}
                                />
                              ))}
                            </Pie>
                            <ChartTooltip 
                              formatter={(value, name, props) => [
                                `Count: ${value}`, 
                                `Category: ${props.payload.fullPath}`
                              ]} 
                            />
                            <Legend />
                          </RechartsPC>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category buckets pie chart */}
                  {selectedCategory && (
                    <Card>
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg">
                            Buckets in {selectedCategory} Category
                          </CardTitle>
                          <PieChart className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <CardDescription>
                          Distribution of domain label buckets within the selected category
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <Label className="mb-2 block">Select a category</Label>
                          <Select
                            value={selectedCategory}
                            onValueChange={(value) => {
                              setSelectedCategory(value);
                              // Reset bucket selection
                              const category = domainCategories.find(c => c.path === value);
                              if (category && category.buckets.length > 0) {
                                setSelectedBucket(category.buckets[0].path);
                              } else {
                                setSelectedBucket(null);
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a domain category" />
                            </SelectTrigger>
                            <SelectContent>
                              {domainCategories.map((category) => (
                                <SelectItem key={category.path} value={category.path}>
                                  {category.path} ({category.count})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Pie chart for bucket distribution */}
                          <div className="h-96 w-full">
                            <h3 className="text-sm font-medium mb-2">Distribution by Bucket</h3>
                            <ResponsiveContainer width="100%" height={320}>
                              <RechartsPC>
                                <Pie
                                  data={getCategoryBucketsPieData()}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={100}
                                  innerRadius={30}
                                  fill="#8884d8"
                                  dataKey="value"
                                  nameKey="name"
                                  label={({ name, percent }) => 
                                    getCategoryBucketsPieData().length <= 6 
                                      ? `${name} (${(percent * 100).toFixed(0)}%)`
                                      : undefined
                                  }
                                  onClick={(data) => {
                                    setSelectedBucket(data.fullPath);
                                  }}
                                >
                                  {getCategoryBucketsPieData().map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={chartColors[(index + domainCategories.length) % chartColors.length]}
                                      stroke={entry.fullPath === selectedBucket ? "#000" : undefined}
                                      strokeWidth={entry.fullPath === selectedBucket ? 2 : 0}
                                    />
                                  ))}
                                </Pie>
                                <ChartTooltip 
                                  formatter={(value, name, props) => [
                                    `Count: ${value}`, 
                                    `Path: ${props.payload.completePath}`
                                  ]} 
                                />
                                <Legend 
                                  layout="horizontal" 
                                  align="center" 
                                  verticalAlign="bottom"
                                  wrapperStyle={{ 
                                    fontSize: '10px',
                                    marginTop: '10px'
                                  }}
                                />
                              </RechartsPC>
                            </ResponsiveContainer>
                          </div>
                          
                          {/* Date-wise bar chart for category */}
                          <div className="h-96 w-full">
                            <h3 className="text-sm font-medium mb-2">Category Trend Over Time</h3>
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                              <Badge variant="secondary">
                                {getSelectedCategoryData()?.count || 0} total occurrences
                              </Badge>
                              <span>{getCategoryDateWiseData().length} days of data</span>
                            </div>
                            <ResponsiveContainer width="100%" height={320}>
                              <RechartsBC
                                data={getCategoryDateWiseData()}
                                margin={{ top: 10, right: 10, left: 10, bottom: 40 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                  dataKey="date" 
                                  angle={-45} 
                                  textAnchor="end"
                                  height={50}
                                />
                                <YAxis 
                                  ticks={getIntegerTicks(getCategoryDateWiseData())}
                                  allowDecimals={false}
                                  domain={[0, 'dataMax']} 
                                />
                                <ChartTooltip
                                  formatter={(value, name, props) => [
                                    `Count: ${value}`, 
                                    `Date: ${props.payload.rawDate}`
                                  ]}
                                />
                                <Bar 
                                  dataKey="count" 
                                  fill={chartColors[(domainCategories.findIndex(c => c.path === selectedCategory)) % chartColors.length]}
                                  radius={[4, 4, 0, 0]} 
                                  name="Total Occurrences"
                                />
                              </RechartsBC>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        {/* Table view for many buckets */}
                        {getCategoryBucketsPieData().length > 8 && (
                          <div className="mt-6 overflow-auto max-h-60 border rounded-md">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 sticky top-0">
                                <tr>
                                  <th className="text-left p-2">Bucket</th>
                                  <th className="text-right p-2">Count</th>
                                  <th className="text-right p-2">Percentage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getCategoryBucketsPieData()
                                  .sort((a, b) => b.value - a.value) // Sort by count descending
                                  .map((bucket, i) => {
                                    // Calculate percentage
                                    const total = getCategoryBucketsPieData().reduce((sum, item) => sum + item.value, 0);
                                    const percentage = total > 0 ? (bucket.value / total) * 100 : 0;
                                    
                                    return (
                                      <tr key={i} className="border-t hover:bg-accent/50">
                                        <td className="p-2 truncate max-w-[200px]" title={bucket.name}>
                                          <div className="flex items-center">
                                            <div 
                                              className="w-3 h-3 rounded-full mr-2" 
                                              style={{ backgroundColor: chartColors[(i + domainCategories.length) % chartColors.length] }} 
                                            />
                                            {bucket.name}
                                          </div>
                                        </td>
                                        <td className="p-2 text-right">{bucket.value}</td>
                                        <td className="p-2 text-right">{percentage.toFixed(1)}%</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* All buckets in category breakdown */}
                  {selectedCategory && getSelectedCategoryData()?.buckets.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          All Buckets in {selectedCategory} Category
                        </CardTitle>
                        <CardDescription>
                          Daily breakdown for all buckets in this category
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {getSelectedCategoryData()?.buckets.map((bucket, index) => (
                            <div key={bucket.path} className="border rounded-lg p-4">
                              <div className="flex justify-between items-center mb-4">
                                <div>
                                  <h4 className="text-base font-medium mb-1 truncate" title={bucket.path}>{bucket.path}</h4>
                                  <div className="flex items-center flex-wrap gap-2">
                                    <Badge variant="secondary" className="mr-2">
                                      {bucket.count} occurrences
                                    </Badge>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => openConversationViewer(selectedCategory, bucket.path)}
                                      >
                                        <MessageSquare className="h-3 w-3 mr-1" />
                                        View Conversations
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => window.open(`/domains/${selectedCategory}/${bucket.path}`, '_blank')}
                                      >
                                        Export
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="h-40 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RechartsBC
                                    data={bucket.dateWise.map(dateItem => ({
                                      date: formatChartDate(dateItem.day),
                                      count: dateItem.count,
                                      rawDate: dateItem.day
                                    }))}
                                    margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
                                  >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis 
                                      dataKey="date" 
                                      angle={-45} 
                                      textAnchor="end"
                                      height={40}
                                      tick={{ fontSize: 10 }}
                                    />
                                    <YAxis 
                                      tick={{ fontSize: 10 }} 
                                      ticks={getIntegerTicks(bucket.dateWise)}
                                      allowDecimals={false}
                                      domain={[0, 'dataMax']}
                                    />
                                    <ChartTooltip />
                                    <Bar 
                                      dataKey="count" 
                                      fill={chartColors[(index + domainCategories.length) % chartColors.length]} 
                                      radius={[2, 2, 0, 0]}
                                    />
                                  </RechartsBC>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={fetchAggregationData} 
                variant="outline" 
                className="w-full"
                disabled={isLoadingAggregation}
              >
                {isLoadingAggregation ? (
                  <span className="flex items-center">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </span>
                ) : "Refresh Dashboard Data"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Domain Label Selection</DialogTitle>
            <DialogDescription>
              You're about to create a new domain label rule based on this suggestion.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLabel && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Label Path:</p>
                <p className="text-sm font-mono bg-muted p-2 rounded">{selectedLabel.suggestion}</p>
              </div>
              
              {selectedLabel.definition && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Definition:</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedLabel.definition}</p>
                </div>
              )}
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Attribution:</p>
                <p className="text-sm font-mono bg-muted p-2 rounded">{AUTHOR_EMAIL}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Cluster ID:</p>
                <p className="text-sm font-mono bg-muted p-2 rounded">{selectedLabel.clusterId}</p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isAcceptingLabel}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmLabelSelection}
              disabled={isAcceptingLabel}
            >
              {isAcceptingLabel ? (
                <span className="flex items-center">
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </span>
              ) : "Accept Label"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversation Viewer Modal */}
      <Dialog 
        open={conversationsModalOpen} 
        onOpenChange={setConversationsModalOpen}
        modal={true}
      >
        <DialogContent className="w-[98vw] h-[98vh] max-w-[98vw] max-h-[98vh] flex flex-col p-6">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle>Conversations for {currentDomainLabel}</DialogTitle>
              <DialogDescription>
                Viewing conversations matching this domain label
              </DialogDescription>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConversationsModalOpen(false)}
              className="text-white font-medium"
            >
              Close Viewer
            </Button>
          </DialogHeader>
          
          <div className="flex-1 flex gap-4 mt-4 min-h-0 h-[calc(100%-4rem)]">
            {/* Conversation List Panel */}
            <div className="w-1/3 border rounded-md flex flex-col min-h-0">
              <div className="p-3 border-b bg-muted/50">
                <h3 className="font-medium text-sm">Conversation List</h3>
              </div>
              
              <div 
                className="flex-1 overflow-auto"
                ref={conversationListRef}
                onScroll={handleConversationListScroll}
              >
                {isLoadingConversations && conversations.length === 0 ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : conversationsError && conversations.length === 0 ? (
                  <div className="p-4 text-center text-red-500">
                    <p>{conversationsError.message}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2" 
                      onClick={() => currentDomainLabel && fetchConversations(currentDomainLabel)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <p>No conversations found for this domain label</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {conversations.map((conversation) => (
                      <div 
                        key={conversation.id} 
                        className={`p-3 hover:bg-accent/50 cursor-pointer transition-colors ${
                          selectedConversation?.id === conversation.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => setSelectedConversation(conversation)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-mono text-xs text-muted-foreground truncate w-3/4">
                            {conversation.id}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {conversation.messages.length} msgs
                          </Badge>
                        </div>
                        <div className="line-clamp-2 text-sm">
                          {conversation.messages.find(m => m.role === "user")?.content || "No content"}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatShortDate(conversation.metadata?.created_at)}
                          </div>
                          {conversation.metadata?.isGenericLabelAvailable && (
                            <Badge variant="outline" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 ml-auto">
                              Generic Label Available
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isLoadingConversations && (
                      <div className="p-4 text-center">
                        <Loader className="h-4 w-4 animate-spin mx-auto" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Loading more conversations...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Conversation Detail Panel */}
            <div className="w-2/3 border rounded-md flex flex-col min-h-0">
              <div className="p-3 border-b bg-muted/50 flex justify-between items-center">
                <h3 className="font-medium text-sm">
                  {selectedConversation 
                    ? `Conversation ${selectedConversation.id}` 
                    : 'Select a conversation to view details'
                  }
                </h3>
                {selectedConversation?.metadata?.model && (
                  <Badge variant="secondary">
                    {selectedConversation.metadata.model}
                  </Badge>
                )}
              </div>
              
              {selectedConversation ? (
                <div className="flex-1 overflow-auto p-4">
                  <div className="space-y-4">
                    {selectedConversation.messages
                      .filter(message => message.role !== "system") 
                      .map((message, index) => (
                        <div 
                          key={index}
                          className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
                        >
                          <div 
                            className={`
                              max-w-[80%] rounded-lg p-3 
                              ${message.role === "assistant" 
                                ? "bg-muted text-foreground mr-auto" 
                                : "bg-primary text-primary-foreground ml-auto"
                              }
                            `}
                          >
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            {message.timestamp && (
                              <div className="text-xs opacity-70 mt-1 text-right">
                                {formatMessageTime(message.timestamp)}
                              </div>
                            )}
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Select a conversation from the list to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
} 