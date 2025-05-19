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
  BarChart, PieChart, MessageSquare, X, Clock, Download, Star
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PieChart as RechartsPC, Pie, ResponsiveContainer, Cell, Legend, Tooltip as ChartTooltip, BarChart as RechartsBC, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import React from "react";

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

// Get the last part of a label path (after the last /)
const getLastPathSegment = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
};

// Add a utility function to format label names
const formatLabelName = (name: string): string => {
  // Split by underscores and capitalize each word
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Add a new UI component for a side drawer
const SideDrawer = ({ 
  open, 
  onClose, 
  children 
}: { 
  open: boolean; 
  onClose: () => void; 
  children: React.ReactNode 
}) => {
  // Add effect to prevent body scrolling when drawer is open
  React.useEffect(() => {
    if (open) {
      // Prevent scrolling on the main page when drawer is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable scrolling when drawer is closed
      document.body.style.overflow = 'auto';
    }
    
    // Cleanup function
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [open]);
  
  return (
    <>
      {/* Backdrop - improved to block all interactions with main content */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity cursor-not-allowed"
          onClick={onClose} 
          aria-hidden="true"
        />
      )}
      
      {/* Drawer - changed to 2/3 width */}
      <div 
        className={`fixed inset-y-0 right-0 w-2/3 bg-zinc-900 border-l border-zinc-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {children}
      </div>
    </>
  );
};

// Add a helper function to format the domain label for display
const formatDomainLabelForDisplay = (domainLabel: string | null): string => {
  if (!domainLabel) return "Conversations";
  
  // Extract the last part of the path (the actual label)
  const parts = domainLabel.split('/');
  const label = parts.length > 2 ? parts[parts.length - 1] : parts[0];
  
  // Convert snake_case to Title Case
  return label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') + " Conversations";
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
  
  // Agentic UX enhancements
  const [recommendedLabels, setRecommendedLabels] = useState<GenericLabel[]>([]);
  const [recentLabels, setRecentLabels] = useState<string[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<Record<string, GenericLabel[]>>({});
  const [sampleConversations, setSampleConversations] = useState<Record<string, string[]>>({});
  const [showLabelCards, setShowLabelCards] = useState(true);

  // Fetch generic labels on component mount
  useEffect(() => {
    async function fetchGenericLabels() {
      setIsLoadingGenericLabels(true);
      setGenericLabelsError(null);
      
      try {
        const data = await getGenericLabels();
        setGenericLabels(data);
        
        // Set recommended labels (those with highest counts)
        const sortedByCount = [...data].sort((a, b) => b.count - a.count);
        setRecommendedLabels(sortedByCount.slice(0, 3));
        
        // Get recent labels from localStorage
        const recentLabelsFromStorage = localStorage.getItem('recentGenericLabels');
        if (recentLabelsFromStorage) {
          try {
            setRecentLabels(JSON.parse(recentLabelsFromStorage));
          } catch (e) {
            console.error("Error parsing recent labels from localStorage:", e);
            setRecentLabels([]);
          }
        }
        
        // Group labels by their top-level category
        const groups: Record<string, GenericLabel[]> = {};
        data.forEach(label => {
          // Extract top-level category from the path
          const parts = label.path.split('/');
          if (parts.length > 1) {
            const category = parts[0];
            if (!groups[category]) {
              groups[category] = [];
            }
            groups[category].push(label);
          } else {
            // Handle labels without a category
            if (!groups['general']) {
              groups['general'] = [];
            }
            groups['general'].push(label);
          }
        });
        setCategoryGroups(groups);
        
        // Generate mock sample conversations for each label
        // In a real app, you would fetch these from the API
        const mockSamples: Record<string, string[]> = {};
        data.forEach(label => {
          // Create 2-3 sample conversations per label
          const samplesCount = Math.floor(Math.random() * 2) + 2; // 2 or 3 samples
          const samples = [];
          
          for (let i = 0; i < samplesCount; i++) {
            let sample = '';
            
            if (label.path.includes('user_escalation')) {
              if (label.path.includes('negative_sentiment')) {
                sample = "Customer: I've been waiting for assistance for over 20 minutes and nobody is helping me! This is ridiculous. Let me speak to a manager right now.";
              } else {
                sample = "Customer: I've tried everything the bot suggested, but it's not working. Can I please speak to a human agent?";
              }
            } else if (label.path.includes('technical_issue')) {
              sample = "Customer: The app keeps crashing whenever I try to complete my payment. I've tried restarting my phone but that didn't help.";
            } else if (label.path.includes('billing')) {
              sample = "Customer: I'm looking at my statement and there's a charge I don't recognize. Can you explain what this is for?";
            } else {
              // Generic samples for other categories
              const samples = [
                "Customer: I need help with my account. I can't seem to log in.",
                "Customer: I just had a question about your service options.",
                "Customer: How do I update my shipping address on file?",
                "Customer: When will my order be delivered?",
                "Customer: Can you tell me more about your return policy?"
              ];
              sample = samples[Math.floor(Math.random() * samples.length)];
            }
            
            samples.push(sample);
          }
          
          mockSamples[label.path] = samples;
        });
        setSampleConversations(mockSamples);
        
        // Initialize expanded state for categories
        const initialExpandedState: Record<string, boolean> = {};
        Object.keys(groups).forEach(category => {
          initialExpandedState[category] = false;
        });
        // Expand the first category by default
        if (Object.keys(groups).length > 0) {
          initialExpandedState[Object.keys(groups)[0]] = true;
        }
        setExpandedCategories(initialExpandedState);
        
      } catch (error) {
        console.error("Error fetching generic labels:", error);
        setGenericLabelsError(error instanceof Error ? error : new Error("Failed to fetch generic labels"));
      } finally {
        setIsLoadingGenericLabels(false);
      }
    }
    
    fetchGenericLabels();
  }, []);

  // Fetch domain labels when active tab changes to "existing"
  useEffect(() => {
    if (activeTab === "existing") {
      // First, fetch aggregation data to ensure we have counts for sorting
      fetchAggregationData().then(() => {
        // Then fetch domain labels after aggregation data is loaded
        fetchDomainLabels();
      });
    }
  }, [activeTab]);

  // Modified to fetch domain labels after ensuring aggregation data is loaded
  const fetchDomainLabels = async () => {
    setIsLoadingDomainLabels(true);
    setDomainLabelsError(null);
    
    try {
      const data = await getDomainLabels();
      setDomainLabels(data);
      
      // After loading the data, select the first category (highest count)
      setTimeout(() => {
        const sortedCategories = getSortedCategories();
        console.log("Sorted categories:", sortedCategories);
        if (sortedCategories.length > 0) {
          setSelectedCategory(sortedCategories[0]);
        }
      }, 100); // Small timeout to ensure state updates have processed
      
    } catch (error) {
      console.error("Error fetching domain labels:", error);
      setDomainLabelsError(error instanceof Error ? error : new Error("Failed to fetch domain labels"));
    } finally {
      setIsLoadingDomainLabels(false);
    }
  };

  // Get sorted categories by count - improved to work better with available data
  const getSortedCategories = () => {
    const categories = getDomainLabelsByCategory();
    
    // Use domain categories if available (from aggregation API)
    if (domainCategories.length > 0) {
      // Create a map of category paths to their counts from domainCategories
      const categoryCountMap = new Map();
      domainCategories.forEach(category => {
        categoryCountMap.set(category.path, category.count);
      });
      
      // Sort using the pre-fetched counts
      return Object.keys(categories)
        .map(category => ({
          category,
          // Use the count from domainCategories if available, or fallback to 0
          count: categoryCountMap.get(category) || 0
        }))
        .sort((a, b) => b.count - a.count)
        .map(item => item.category);
    }
    
    // Fallback to calculating counts from labels if domainCategories not available
    return Object.entries(categories)
      .map(([category, labels]) => {
        // Calculate total count for this category
        const count = labels.reduce((sum, label) => {
          const parts = label.label.split('/');
          const bucketPath = parts.length > 2 ? parts[2] : parts[0];
          const categoryPath = parts.length > 2 ? parts[1] : category;
          return sum + (getBucketCount(categoryPath, bucketPath) || 0);
        }, 0);
        
        return { category, count };
      })
      .sort((a, b) => b.count - a.count)
      .map(item => item.category);
  };

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

    // Save to recent labels
    const updatedRecentLabels = [
      selectedGenericLabel,
      ...recentLabels.filter(label => label !== selectedGenericLabel)
    ].slice(0, 5); // Keep only the 5 most recent
    
    setRecentLabels(updatedRecentLabels);
    localStorage.setItem('recentGenericLabels', JSON.stringify(updatedRecentLabels));

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

  // Toggle category expansion for generic label cards
  const toggleCategoryExpansion = (category: string) => {
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

  // Get total count of all domain labels for percentage calculations
  const getTotalDomainCount = () => {
    return domainCategories.reduce((total, category) => total + category.count, 0);
  };

  // Get percentage contribution of a category
  const getCategoryPercentage = (categoryPath: string) => {
    const category = domainCategories.find(c => c.path === categoryPath);
    if (!category) return 0;
    
    const total = getTotalDomainCount();
    return total > 0 ? (category.count / total) * 100 : 0;
  };

  // Get bucket count from domain category data
  const getBucketCount = (categoryPath: string, bucketPath: string) => {
    const category = domainCategories.find(c => c.path === categoryPath);
    if (!category) return 0;
    
    const bucket = category.buckets.find(b => b.path === bucketPath);
    return bucket ? bucket.count : 0;
  };

  // Get percentage contribution of a bucket within its category
  const getBucketPercentage = (categoryPath: string, bucketPath: string) => {
    const category = domainCategories.find(c => c.path === categoryPath);
    if (!category || category.count === 0) return 0;
    
    const bucket = category.buckets.find(b => b.path === bucketPath);
    return bucket ? (bucket.count / category.count) * 100 : 0;
  };

  // Get the selected category name
  const getSelectedCategoryName = () => {
    return selectedCategory || '';
  };

  // Get percentage contribution of the selected category
  const getSelectedCategoryPercentage = () => {
    if (!selectedCategory) return 0;
    return getCategoryPercentage(selectedCategory);
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
          <TabsTrigger value="existing">Problem Buckets</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
        
        <TabsContent value="create" className="space-y-6">
          {/* Guided Experience Banner */}
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full">
                  <InfoIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-blue-700 dark:text-blue-300 mb-2">Guided Labeling Experience</h3>
                  <p className="text-blue-600 dark:text-blue-400 mb-3">
                    This wizard will help you generate intelligent domain label suggestions based on existing generic labels.
                    Follow these steps to create well-structured domain labels:
                  </p>
                  <ol className="list-decimal list-inside text-blue-600 dark:text-blue-400 space-y-1 ml-2">
                    <li>Select a generic label that needs domain-specific labeling</li>
                    <li>Choose the AI model to analyze your data</li>
                    <li>Review suggested clusters of similar conversations</li>
                    <li>Select the most appropriate domain label for each cluster</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generic Labels Selection */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Step 1: Explore Conversation Categories</CardTitle>
                  <CardDescription>
                    Choose a conversation category to analyze and generate domain-specific labels
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowLabelCards(!showLabelCards)}
                    className="flex items-center gap-1"
                  >
                    {showLabelCards ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                          <path d="M1.5 3C1.22386 3 1 3.22386 1 3.5V11.5C1 11.7761 1.22386 12 1.5 12H13.5C13.7761 12 14 11.7761 14 11.5V3.5C14 3.22386 13.7761 3 13.5 3H1.5ZM7 5H13V10H7V5ZM6 5H2V10H6V5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                        </svg>
                        View as List
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                          <path d="M2.5 4C2.22386 4 2 4.22386 2 4.5V6.5C2 6.77614 2.22386 7 2.5 7H4.5C4.77614 7 5 6.77614 5 6.5V4.5C5 4.22386 4.77614 4 4.5 4H2.5ZM2.5 8C2.22386 8 2 8.22386 2 8.5V10.5C2 10.7761 2.22386 11 2.5 11H4.5C4.77614 11 5 10.7761 5 10.5V8.5C5 8.22386 4.77614 8 4.5 8H2.5ZM6 4.5C6 4.22386 6.22386 4 6.5 4H12.5C12.7761 4 13 4.22386 13 4.5V6.5C13 6.77614 12.7761 7 12.5 7H6.5C6.22386 7 6 6.77614 6 6.5V4.5ZM6.5 8C6.22386 8 6 8.22386 6 8.5V10.5C6 10.7761 6.22386 11 6.5 11H12.5C12.7761 11 13 10.7761 13 10.5V8.5C13 8.22386 12.7761 8 12.5 8H6.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                        </svg>
                        View as Cards
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {genericLabelsError && (
                <div className="text-red-500">
                  Error loading generic labels: {genericLabelsError.message}
                </div>
              )}
              
              {isLoadingGenericLabels ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : showLabelCards ? (
                // Card View
                <div className="space-y-6">
                  {Object.entries(categoryGroups).map(([category, labels]) => (
                    <div key={category} className="rounded-lg border overflow-hidden">
                      <div 
                        className={`flex items-center justify-between p-3 ${
                          expandedCategories[category] ? 'bg-accent' : 'bg-background'
                        } hover:bg-accent/80 cursor-pointer border-b`}
                        onClick={() => toggleCategoryExpansion(category)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories[category] ? 
                            <ChevronDown className="h-5 w-5 text-muted-foreground" /> : 
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          }
                          <h3 className="font-medium capitalize">{category}</h3>
                          <Badge variant="default" className="ml-2">{labels.length}</Badge>
                        </div>
                        <Badge variant="default" className="bg-primary/90 hover:bg-primary">
                          {labels.reduce((sum, label) => sum + label.count, 0)} conversations
                        </Badge>
                      </div>
                      
                      {expandedCategories[category] && (
                        <div className="p-3 bg-background/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {labels.map(label => {
                              // Extract subcategory from the full path
                              const parts = label.path.split('/');
                              const subcategory = parts.length > 2 ? parts[1] : "general";
                              const specificLabel = parts.length > 2 ? parts[2] : parts[1];
                              
                              return (
                                <Card 
                                  key={label.path}
                                  className={`overflow-hidden border-2 hover:border-primary cursor-pointer transition-all ${
                                    selectedGenericLabel === label.path ? 'border-primary' : 'border-muted'
                                  }`}
                                  onClick={() => setSelectedGenericLabel(label.path)}
                                >
                                  <CardHeader className="p-3 pb-0">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <CardTitle className="text-base font-medium">{specificLabel}</CardTitle>
                                        <CardDescription className="text-xs mt-1">
                                          Subcategory: <span className="font-medium capitalize">{subcategory}</span>
                                        </CardDescription>
                                      </div>
                                      <Badge variant="secondary" className="ml-1">{label.count}</Badge>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="p-3 pt-2">
                                    <div className="text-xs text-muted-foreground space-y-1 border-t pt-2 mt-1">
                                      <p className="font-medium text-foreground/80">Sample conversations:</p>
                                      {sampleConversations[label.path] && sampleConversations[label.path].slice(0, 1).map((sample, idx) => (
                                        <div key={idx} className="pl-2 border-l-2 border-muted-foreground/20 italic">
                                          {sample}
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // List View (Dropdown)
                <div className="space-y-4">
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
                  
                  {/* Recommended Labels */}
                  {recommendedLabels.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <Star className="h-4 w-4 mr-1 text-yellow-500" />
                        Recommended Labels (High Usage)
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {recommendedLabels.map(label => (
                          <Button 
                            key={label.path} 
                            variant="outline" 
                            size="sm"
                            className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40"
                            onClick={() => setSelectedGenericLabel(label.path)}
                          >
                            {label.path} ({label.count})
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Recent Labels */}
                  {recentLabels.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <Clock className="h-4 w-4 mr-1 text-blue-500" />
                        Recently Used
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {recentLabels.map(label => (
                          <Button 
                            key={label} 
                            variant="outline" 
                            size="sm"
                            className="border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                            onClick={() => setSelectedGenericLabel(label)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
               
              {/* Selected label preview */}
              {selectedGenericLabel && (
                <div className="mt-6 bg-muted/30 rounded-lg p-4 border">
                  <div className="flex flex-col md:flex-row gap-4 items-start">
                    <div className="bg-primary/10 p-3 rounded-full">
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
                        className="text-primary"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-foreground mb-1">Selected: {selectedGenericLabel}</h3>
                      <p className="text-muted-foreground text-sm mb-3">
                        Review sample conversations for this category before generating domain label suggestions:
                      </p>
                      <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                        {sampleConversations[selectedGenericLabel]?.map((sample, idx) => (
                          <div key={idx} className="bg-background p-3 rounded-md text-sm border">
                            {sample}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-4 mt-6">
                <Label htmlFor="model-select">Step 2: Select AI Model</Label>
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
                
                <Button 
                  onClick={fetchDomainSuggestions}
                  disabled={!selectedGenericLabel || !selectedModel || isLoadingSuggestions}
                  className="w-full mt-6"
                  size="lg"
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
                    {/* AI Recommendation Banner */}
                    {getSelectedClusterSuggestions().length > 0 && (
                      <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 p-2 rounded-full">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 16.0002V8.00024C20.9996 7.6473 20.9071 7.30083 20.7315 7.00251C20.556 6.70419 20.3037 6.46423 20 6.31024L13 2.24024C12.696 2.08608 12.3511 2.00391 12 2.00391C11.6489 2.00391 11.304 2.08608 11 2.24024L4 6.31024C3.69626 6.46423 3.44398 6.70419 3.26846 7.00251C3.09294 7.30083 3.00036 7.6473 3 8.00024V16.0002C3.00036 16.3532 3.09294 16.6997 3.26846 16.998C3.44398 17.2963 3.69626 17.5363 4 17.6902L11 21.7602C11.304 21.9144 11.6489 21.9966 12 21.9966C12.3511 21.9966 12.696 21.9144 13 21.7602L20 17.6902C20.3037 17.5363 20.556 17.2963 20.7315 16.998C20.9071 16.6997 20.9996 16.3532 21 16.0002Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3.27 6.96L12 12.01L20.73 6.96" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-purple-800 dark:text-purple-300">AI Recommendation</h3>
                            <p className="text-purple-700 dark:text-purple-400 text-sm mt-1">
                              Based on the conversation examples, our AI suggests selecting:
                            </p>
                            <div className="mt-2 bg-white dark:bg-background/50 border border-purple-200 dark:border-purple-700 rounded-md p-3">
                              <p className="font-medium text-purple-900 dark:text-purple-300">
                                {getSelectedClusterSuggestions().sort((a, b) => b.confidence - a.confidence)[0]?.suggestion || "Loading..."}
                              </p>
                              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                This suggestion has the highest confidence score ({getConfidenceText(getSelectedClusterSuggestions().sort((a, b) => b.confidence - a.confidence)[0]?.confidence || 0)}) 
                                based on semantic analysis.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
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
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-zinc-100">Problem Buckets</CardTitle>
              <CardDescription className="text-zinc-400">
                Explore problem categories and their specific buckets
              </CardDescription>
            </CardHeader>
            <CardContent className="bg-zinc-900 pt-6">
              {isLoadingDomainLabels ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full bg-zinc-800" />
                  <Skeleton className="h-24 w-full bg-zinc-800" />
                  <Skeleton className="h-24 w-full bg-zinc-800" />
                </div>
              ) : domainLabelsError ? (
                <div className="text-red-400 p-4 bg-red-900/30 rounded-md border border-red-800">
                  <p className="font-semibold">Error loading problem buckets</p>
                  <p>{domainLabelsError.message}</p>
                  <Button onClick={fetchDomainLabels} variant="outline" className="mt-2 border-red-700 bg-red-900/20 text-red-300 hover:bg-red-900/40">
                    Try Again
                  </Button>
                </div>
              ) : domainLabels.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <p>No problem buckets have been created yet</p>
                  <Button onClick={() => setActiveTab("create")} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
                    Create Problem Buckets
                  </Button>
                </div>
              ) : (
                <>
                  {/* Category navigation only - sorted by count in descending order */}
                  <div className="flex overflow-x-auto pb-2 mb-6 gap-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-800">
                    {getSortedCategories().map(category => (
                      <Button 
                        key={category} 
                        variant={selectedCategory === category ? "default" : "outline"}
                        size="sm" 
                        className={`whitespace-nowrap rounded-full capitalize ${
                          selectedCategory === category 
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white" 
                            : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800"
                        }`}
                        onClick={() => {
                          // Clear current selection if clicking the same category
                          if (selectedCategory === category) {
                            setSelectedCategory(null);
                          } else {
                            setSelectedCategory(category);
                          }
                          
                          // Only fetch aggregation data if not already loaded
                          if (domainCategories.length === 0) {
                            fetchAggregationData();
                          }
                        }}
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                  
                  {/* Selected category info */}
                  {selectedCategory && (
                    <div className="mb-6 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <div className="flex justify-between items-center">
                        <h3 className="text-base font-medium capitalize text-zinc-200">
                          {getSelectedCategoryName()} Problems
                        </h3>
                        <Badge variant="outline" className="bg-indigo-900/40 text-indigo-300 border-indigo-700">
                          {getSelectedCategoryPercentage().toFixed(1)}% of all problems
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {/* Interactive Problem Buckets Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(getDomainLabelsByCategory())
                      // Filter by selected category if one is selected
                      .filter(([category, _]) => !selectedCategory || category === selectedCategory)
                      .map(([category, labels]) => {
                        // Sort labels by bucket count in descending order
                        const sortedLabels = [...labels].sort((a, b) => {
                          const partsA = a.label.split('/');
                          const partsB = b.label.split('/');
                          const bucketPathA = partsA.length > 2 ? partsA[2] : partsA[0];
                          const categoryPathA = partsA.length > 2 ? partsA[1] : category;
                          const bucketPathB = partsB.length > 2 ? partsB[2] : partsB[0];
                          const categoryPathB = partsB.length > 2 ? partsB[1] : category;
                          
                          const countA = getBucketCount(categoryPathA, bucketPathA);
                          const countB = getBucketCount(categoryPathB, bucketPathB);
                          
                          return countB - countA; // Descending order
                        });
                        
                        return (
                          <React.Fragment key={category}>
                            {sortedLabels.map((label) => {
                              // Extract category parts for better display
                              const parts = label.label.split('/');
                              const displayLabel = parts.length > 2 ? parts[parts.length - 1] : parts[0];
                              const bucketPath = parts.length > 2 ? parts[2] : parts[0];
                              const categoryPath = parts.length > 2 ? parts[1] : category;
                              
                              // Get metrics for this bucket
                              const bucketCount = getBucketCount(categoryPath, bucketPath);
                              const bucketPercentage = getBucketPercentage(categoryPath, bucketPath);
                              
                              return (
                                <Card 
                                  key={label.id} 
                                  className="group overflow-hidden border border-zinc-800 hover:border-indigo-600 hover:shadow-[0_0_0_1px_rgba(79,70,229,0.4)] transition-all cursor-pointer h-auto bg-zinc-900"
                                  onClick={() => {
                                    // Extract category and bucket from label path
                                    const parts = label.label.split('/');
                                    if (parts.length >= 3) {
                                      const category = parts[1];
                                      const bucket = parts[2];
                                      openConversationViewer(category, bucket);
                                    }
                                  }}
                                >
                                  <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                      <CardTitle className="text-lg text-zinc-100 group-hover:text-indigo-300 transition-colors">
                                        {formatLabelName(displayLabel)}
                                      </CardTitle>
                                      {/* Info icon with tooltip for definition */}
                                      {label.definition && (
                                        <div className="relative group/tooltip">
                                          <div className="p-1.5 rounded-full hover:bg-zinc-800 cursor-help">
                                            <InfoIcon className="h-4 w-4 text-zinc-500 group-hover:text-indigo-400" />
                                          </div>
                                          <div className="absolute right-0 w-64 p-3 mt-2 bg-zinc-900 text-zinc-300 text-sm rounded-md shadow-lg border border-zinc-700 z-50 invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 transition-opacity">
                                            {label.definition}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </CardHeader>
                                  <CardContent className="pb-3">
                                    {/* Metrics information */}
                                    <div className="bg-zinc-800 rounded-md mb-3 overflow-hidden">
                                      <div className="p-4">
                                        {/* Larger count display with more space */}
                                        <div className="py-3 text-center">
                                          <span className="text-5xl font-bold text-indigo-300" style={{ fontSize: "3.5rem" }}>{bucketCount}</span>
                                        </div>
                                        
                                        {/* Contribution with inline bar */}
                                        <div className="flex items-center gap-2 mt-2">
                                          <span className="text-xs whitespace-nowrap text-zinc-400">Contribution:</span>
                                          <div className="flex-grow h-2 bg-zinc-700/50 rounded-full">
                                            <div 
                                              className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full" 
                                              style={{ width: `${Math.max(bucketPercentage, 3)}%` }} 
                                            />
                                          </div>
                                          <span className="text-xs font-medium text-zinc-300">{bucketPercentage.toFixed(1)}%</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {/* Technical badge */}
                                      {label.label.includes('technical') && (
                                        <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 border-blue-800">
                                          Technical
                                        </Badge>
                                      )}
                                      {/* Billing badge */}
                                      {label.label.includes('billing') && (
                                        <Badge variant="secondary" className="bg-green-900/30 text-green-300 border-green-800">
                                          Billing
                                        </Badge>
                                      )}
                                      {/* Support badge */}
                                      {label.label.includes('support') && (
                                        <Badge variant="secondary" className="bg-purple-900/30 text-purple-300 border-purple-800">
                                          Support
                                        </Badge>
                                      )}
                                      {/* Removed escalation badge */}
                                    </div>
                                  </CardContent>
                                  <CardFooter className="flex justify-between items-center pt-0 text-sm text-zinc-500 border-t border-zinc-800 px-4 py-3 bg-zinc-900/80">
                                    <div className="flex items-center">
                                      <User className="h-3 w-3 mr-1" />
                                      <span className="truncate max-w-[100px]" title={label.author}>
                                        {label.author.split('@')[0]}
                                      </span>
                                    </div>
                                    <div className="flex items-center">
                                      <Calendar className="h-3 w-3 mr-1" />
                                      {formatDate(label.createdAt).split(',')[0]}
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 px-3 bg-indigo-900/20 text-indigo-300 border-indigo-800 hover:bg-indigo-900/40 hover:text-indigo-200">
                                      <MessageSquare className="h-3 w-3 mr-1" />
                                      View Conversations
                                    </Button>
                                  </CardFooter>
                                </Card>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t border-zinc-800 bg-zinc-900">
              <Button 
                onClick={() => setActiveTab("create")} 
                variant="outline"
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              >
                Create New Problem Bucket
              </Button>
              <Button 
                onClick={fetchDomainLabels} 
                variant="outline"
                disabled={isLoadingDomainLabels}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
              >
                {isLoadingDomainLabels ? (
                  <span className="flex items-center">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </span>
                ) : "Refresh Problem Buckets"}
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

      {/* Conversation Viewer Modal - Replaced with side drawer */}
      <SideDrawer
        open={conversationsModalOpen}
        onClose={() => setConversationsModalOpen(false)}
      >
        <div className="flex flex-col h-full">
          <div className="border-b border-zinc-800 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                {formatDomainLabelForDisplay(currentDomainLabel)}
              </h2>
              <p className="text-sm text-zinc-400">
                {currentDomainLabel}
              </p>
            </div>
            <button
              onClick={() => setConversationsModalOpen(false)}
              className="h-10 w-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="flex-1 flex gap-4 p-4 min-h-0 h-[calc(100%-4rem)]">
            {/* Conversation List Panel - on the left */}
            <div className="w-1/3 border border-zinc-800 rounded-md flex flex-col min-h-0">
              <div className="p-3 border-b border-zinc-800 bg-zinc-800/50">
                <h3 className="font-medium text-sm text-zinc-300">Conversation List</h3>
              </div>
              
              <div 
                className="flex-1 overflow-auto"
                ref={conversationListRef}
                onScroll={handleConversationListScroll}
              >
                {isLoadingConversations && conversations.length === 0 ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-16 w-full bg-zinc-800" />
                    ))}
                  </div>
                ) : conversationsError && conversations.length === 0 ? (
                  <div className="p-4 text-center text-red-400">
                    <p>{conversationsError.message}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2 border-red-800 bg-red-900/20 text-red-400" 
                      onClick={() => currentDomainLabel && fetchConversations(currentDomainLabel)}
                    >
                      Retry
                    </Button>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">
                    <p>No conversations found for this domain label</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {conversations.map((conversation) => (
                      <div 
                        key={conversation.id} 
                        className={`p-3 hover:bg-zinc-800/70 cursor-pointer transition-colors ${
                          selectedConversation?.id === conversation.id ? 'bg-zinc-800' : ''
                        }`}
                        onClick={() => setSelectedConversation(conversation)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-mono text-xs text-zinc-500 truncate w-3/4">
                            {conversation.id}
                          </span>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 bg-zinc-800 text-zinc-400">
                            {conversation.messages.length} msgs
                          </Badge>
                        </div>
                        <div className="line-clamp-2 text-sm text-zinc-300">
                          {conversation.messages.find(m => m.role === "user")?.content || "No content"}
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatShortDate(conversation.metadata?.created_at)}
                          </div>
                          {conversation.metadata?.isGenericLabelAvailable && (
                            <Badge variant="outline" className="text-[10px] bg-indigo-900/30 text-indigo-300 border-indigo-800 ml-auto">
                              Generic Label Available
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isLoadingConversations && (
                      <div className="p-4 text-center">
                        <Loader className="h-4 w-4 animate-spin mx-auto text-indigo-400" />
                        <p className="text-xs text-zinc-500 mt-1">
                          Loading more conversations...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Conversation Detail Panel - on the right */}
            <div className="w-2/3 border border-zinc-800 rounded-md flex flex-col min-h-0">
              <div className="p-3 border-b border-zinc-800 bg-zinc-800/50 flex justify-between items-center">
                <h3 className="font-medium text-sm text-zinc-300">
                  {selectedConversation 
                    ? `Conversation ${selectedConversation.id}` 
                    : 'Select a conversation to view details'
                  }
                </h3>
                {selectedConversation?.metadata?.model && (
                  <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-zinc-700">
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
                                ? "bg-zinc-800 text-zinc-300 mr-auto" 
                                : "bg-indigo-900/70 text-indigo-100 ml-auto"
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
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <div className="text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Select a conversation from the list to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </SideDrawer>
    </PageContainer>
  );
} 