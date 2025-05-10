import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRunResult, RunResult, getRunAggregation, AggregationData, Level1Aggregation, Level2Aggregation, getRunDetails, RunDetails } from "@/lib/api";
import { toast } from "sonner";
import { exportAnnotations } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Color schemes for the charts
const L1_COLORS = {
  "NLU_LOW_CONFIDENCE": "#3498db",
  "CONTEXT_CARRYOVER_FAIL": "#2ecc71",
  "CONTENT_GAP": "#e74c3c",
  "USER_ESCALATION": "#9b59b6",
  "SYSTEM_ERROR": "#f39c12"
};

const L2_COLORS = ["#000000", "#333333", "#555555", "#777777", "#999999"];

export default function ResultsDashboardPage() {
  const { runId } = useParams<{ runId: string }>();
  const [results, setResults] = useState<RunResult | null>(null);
  const [runDetails, setRunDetails] = useState<RunDetails | null>(null);
  const [aggregationData, setAggregationData] = useState<AggregationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAggregation, setLoadingAggregation] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!runId) return;
      
      setLoading(true);
      setLoadingAggregation(true);
      
      try {
        // Get the evaluation ID from localStorage if available
        const evalId = localStorage.getItem("lastRunEvalId") || "unknown";
        
        // Fetch run details with actual stats
        const details = await getRunDetails(evalId, runId);
        setRunDetails(details);
        
        // For backward compatibility, still fetch and use the old results for any data not in runDetails
        const data = await getRunResult(runId);
        setResults(data);
      } catch (error) {
        console.error("Failed to fetch results:", error);
        toast.error("Failed to load results");
      } finally {
        setLoading(false);
      }
      
      try {
        // Fetch aggregation data
        const aggregation = await getRunAggregation(runId);
        setAggregationData(aggregation);
      } catch (error) {
        console.error("Failed to fetch aggregation data:", error);
        toast.error("Failed to load aggregation data");
      } finally {
        setLoadingAggregation(false);
      }
    };

    fetchData();
  }, [runId]);

  const handleDownload = async (format: "xlsx" | "jsonl") => {
    if (!runId) return;
    
    setDownloading(true);
    try {
      const blob = await exportAnnotations(runId, format);
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `handover-analysis-${runId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${format.toUpperCase()} exported successfully`);
    } catch (error) {
      console.error("Failed to export:", error);
      toast.error(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setDownloading(false);
    }
  };

  // Format data for Level 1 pie chart with percentages
  const formatLevel1Data = (data: Level1Aggregation[]) => {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    return data.map(item => ({
      ...item,
      percentage: ((item.count / total) * 100).toFixed(1)
    }));
  };

  // Get Level 2 data for a specific Level 1 category
  const getLevel2Data = (level1Name: string) => {
    if (!aggregationData) return [];
    
    const level1Category = aggregationData.aggregations.find(agg => agg.name === level1Name);
    if (!level1Category) return [];
    
    const total = level1Category.level2.reduce((sum, item) => sum + item.count, 0);
    return level1Category.level2.map(item => ({
      ...item,
      percentage: ((item.count / total) * 100).toFixed(1)
    }));
  };

  // Custom tooltip for the pie charts
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border p-2 rounded-md shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm">{`Count: ${data.count}`}</p>
          <p className="text-sm">{`Percentage: ${data.percentage}%`}</p>
        </div>
      );
    }
    return null;
  };

  // Get color for Level 1 category
  const getLevel1Color = (name: string) => {
    return L1_COLORS[name as keyof typeof L1_COLORS] || "#000000";
  };

  return (
    <PageContainer
      title="Results Dashboard"
      description="Analysis results and statistics"
    >
      {loading ? (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : results && runDetails ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Passed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{runDetails.result_counts?.passed || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Successfully labelled conversations
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{runDetails.result_counts?.failed || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversations with labelling issues
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{runDetails.result_counts?.errored || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  System or processing errors
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Aggregation charts from real API data */}
          {loadingAggregation ? (
            <div className="space-y-8">
              <Skeleton className="h-80 mx-auto max-w-2xl" />
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            </div>
          ) : aggregationData ? (
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-4">
                Annotation Results (Total: {aggregationData.annotationsCount})
              </h2>
              
              {aggregationData.aggregations && aggregationData.aggregations.length > 0 ? (
                <>
                  {/* Centered Level-1 Pie Chart */}
                  <div className="mb-8 mx-auto max-w-2xl">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-center">Level-1 Reason Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="flex justify-center">
                        <div className="h-80 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={formatLevel1Data(aggregationData.aggregations)}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={120}
                                fill="#8884d8"
                                paddingAngle={2}
                                dataKey="count"
                                nameKey="name"
                                label={({ name, percentage }) => `${name}: ${percentage}%`}
                                labelLine={true}
                                isAnimationActive={true}
                              >
                                {aggregationData.aggregations.map((entry) => (
                                  <Cell 
                                    key={`l1-cell-${entry.name}`} 
                                    fill={getLevel1Color(entry.name)}
                                  />
                                ))}
                              </Pie>
                              <Tooltip content={<CustomPieTooltip />} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Level-2 Breakdown Cards - 2 per row */}
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    {aggregationData.aggregations.map((level1Category) => (
                      <Card key={level1Category.name}>
                        <CardHeader>
                          <CardTitle style={{ color: getLevel1Color(level1Category.name) }}>
                            {level1Category.name} Breakdown
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-64">
                            {getLevel2Data(level1Category.name).length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={getLevel2Data(level1Category.name)}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={2}
                                    dataKey="count"
                                    nameKey="name"
                                    label={({ name, percentage }) => `${percentage}%`}
                                    labelLine={false}
                                    isAnimationActive={true}
                                  >
                                    {getLevel2Data(level1Category.name).map((entry, index) => (
                                      <Cell 
                                        key={`l2-cell-${entry.name}`} 
                                        fill={L2_COLORS[index % L2_COLORS.length]} 
                                      />
                                    ))}
                                  </Pie>
                                  <Tooltip content={<CustomPieTooltip />} />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="h-full flex items-center justify-center">
                                <p className="text-muted-foreground">
                                  No Level-2 data available for this category
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-md border p-6 bg-muted/10 text-center mb-8">
                  <h3 className="text-lg font-medium">Annotations are not available</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    No annotation data was found for this run.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border p-6 bg-muted/10 text-center mb-8">
              <h3 className="text-lg font-medium">Aggregation data not available</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Could not fetch detailed classification data for this run.
              </p>
            </div>
          )}

          <div className="flex gap-4 mt-8 justify-between">
            <div>
              <Button asChild>
                <Link to={`/runs/${runId}/annotations`}>
                  View Annotations
                </Link>
              </Button>
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                onClick={() => handleDownload("jsonl")}
                disabled={downloading}
              >
                Download JSONL
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownload("xlsx")}
                disabled={downloading}
              >
                Download XLSX
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <h3 className="text-xl font-medium">No results found</h3>
          <p className="text-muted-foreground mt-2">
            The run may have failed or not been completed yet
          </p>
        </div>
      )}
    </PageContainer>
  );
}
