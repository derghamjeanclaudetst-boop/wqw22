import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileImage, FileText, Trash2, Eye, Download, Camera, Edit3 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { WorkOrderWithUsers, WorkOrderFile } from "@shared/schema";

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrderWithUsers;
}

interface FileUploadData {
  file: File;
  category: string;
  description: string;
}

export function FileUploadModal({ isOpen, onClose, workOrder }: FileUploadModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedFiles, setSelectedFiles] = useState<FileUploadData[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("before");
  const [previewFile, setPreviewFile] = useState<{ file: File; url: string } | null>(null);

  // Fetch existing files
  const { data: existingFiles = [], isLoading } = useQuery<WorkOrderFile[]>({
    queryKey: [`/api/work-orders/${workOrder.id}/files`],
    enabled: isOpen,
  });

  const uploadFilesMutation = useMutation({
    mutationFn: async (files: FileUploadData[]) => {
      const results = [];
      for (const fileData of files) {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('category', fileData.category);
        formData.append('description', fileData.description);
        formData.append('uploadedBy', user?.id?.toString() || '1');

        console.log('Uploading file:', fileData.file.name, 'Category:', fileData.category);

        const response = await fetch(`/api/work-orders/${workOrder.id}/files`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload error:', errorText);
          throw new Error(`Failed to upload ${fileData.file.name}: ${errorText}`);
        }

        const result = await response.json();
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/files`] });
      toast({
        title: "Success",
        description: `${selectedFiles.length} file(s) uploaded successfully`,
      });
      setSelectedFiles([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: number) => 
      apiRequest("DELETE", `/api/work-orders/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/files`] });
      toast({
        title: "Success",
        description: "File deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete file",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    console.log('Selected files:', files.length, 'for category:', activeCategory);
    const newFileData = files.map(file => ({
      file,
      category: activeCategory,
      description: `${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} - ${file.name}`,
    }));
    setSelectedFiles([...selectedFiles, ...newFileData]);
    // Clear the input to allow selecting the same file again
    event.target.value = '';
  }, [selectedFiles, activeCategory]);

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const updateFileDescription = (index: number, description: string) => {
    const updated = [...selectedFiles];
    updated[index].description = description;
    setSelectedFiles(updated);
  };

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one file to upload",
        variant: "destructive",
      });
      return;
    }
    uploadFilesMutation.mutate(selectedFiles);
  };

  const getFileIcon = (fileType: string) => {
    if (fileType && fileType.startsWith('image/')) return FileImage;
    return FileText;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "before": return "bg-blue-100 text-blue-800";
      case "after": return "bg-green-100 text-green-800";
      case "signature": return "bg-purple-100 text-purple-800";
      case "document": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const categories = [
    { id: "before", label: "Before Photos", icon: Camera, color: "blue" },
    { id: "after", label: "After Photos", icon: Camera, color: "green" },
    { id: "signature", label: "Signatures", icon: Edit3, color: "purple" },
    { id: "document", label: "Documents", icon: FileText, color: "gray" },
  ];

  // Group existing files by category
  const filesByCategory = existingFiles.reduce((acc, file) => {
    if (!acc[file.category]) acc[file.category] = [];
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, WorkOrderFile[]>);

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Loading Files</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3">Loading...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File Management - {workOrder.workOrderNumber}</DialogTitle>
          <DialogDescription>
            Upload and manage files for {workOrder.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Categories */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((category) => {
              const Icon = category.icon;
              const fileCount = filesByCategory[category.id]?.length || 0;
              return (
                <Card 
                  key={category.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow ${
                    activeCategory === category.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <CardContent className="p-4 text-center">
                    <Icon className={`h-8 w-8 mx-auto mb-2 text-${category.color}-600`} />
                    <p className="font-medium">{category.label}</p>
                    <Badge variant="secondary" className="mt-1">
                      {fileCount} files
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* File Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Files - {categories.find(c => c.id === activeCategory)?.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file-upload">Select Files</Label>
                  <input
                    id="file-upload"
                    type="file"
                    multiple={activeCategory !== 'signature'}
                    accept={activeCategory === 'signature' ? 'image/*' : activeCategory === 'before' || activeCategory === 'after' ? 'image/*' : '*/*'}
                    onChange={handleFileSelect}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    {activeCategory === 'signature' 
                      ? 'Upload signature images (PNG, JPG, JPEG) - Single file only'
                      : activeCategory === 'before' || activeCategory === 'after'
                      ? 'Upload photos (PNG, JPG, JPEG) - Multiple files allowed'
                      : 'Upload any file type (images, PDFs, documents)'
                    }
                  </p>
                </div>

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
                    {selectedFiles.map((fileData, index) => {
                      const Icon = getFileIcon(fileData.file.type);
                      return (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Icon className="h-5 w-5 text-gray-500" />
                            <div>
                              <p className="font-medium">{fileData.file.name}</p>
                              <p className="text-sm text-gray-500">
                                {formatFileSize(fileData.file.size)} • {fileData.category}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={fileData.description}
                              onChange={(e) => updateFileDescription(index, e.target.value)}
                              placeholder="File description"
                              className="text-sm border rounded px-2 py-1 w-48"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeSelectedFile(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedFiles.length > 0 && (
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleUpload}
                      disabled={uploadFilesMutation.isPending}
                    >
                      {uploadFilesMutation.isPending ? "Uploading..." : `Upload ${selectedFiles.length} File(s)`}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Existing Files */}
          <Card>
            <CardHeader>
              <CardTitle>Existing Files</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(filesByCategory).length > 0 ? (
                <div className="space-y-6">
                  {categories.map(category => {
                    const files = filesByCategory[category.id] || [];
                    if (files.length === 0) return null;

                    return (
                      <div key={category.id}>
                        <h4 className="font-medium mb-3 flex items-center">
                          <category.icon className="h-4 w-4 mr-2" />
                          {category.label} ({files.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {files.map((file) => {
                            const Icon = getFileIcon(file.mimeType);
                            return (
                              <div key={file.id} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <Icon className="h-5 w-5 text-gray-500" />
                                    <Badge className={getCategoryColor(file.category)}>
                                      {file.category}
                                    </Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => deleteFileMutation.mutate(file.id)}
                                    disabled={deleteFileMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <h5 className="font-medium truncate" title={file.fileName}>
                                  {file.fileName}
                                </h5>
                                
                                <p className="text-xs text-gray-500 mt-2">
                                  Uploaded {formatDate(file.createdAt)}
                                </p>
                                
                                <div className="flex space-x-2 mt-3">
                                  {file.mimeType && file.mimeType.startsWith('image/') && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        // Create a blob URL for preview
                                        fetch(file.filePath)
                                          .then(res => res.blob())
                                          .then(blob => {
                                            const url = URL.createObjectURL(blob);
                                            setPreviewFile({ file: new File([blob], file.fileName), url });
                                          });
                                      }}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      Preview
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(file.filePath, '_blank')}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No files uploaded yet</h3>
                  <p className="text-gray-600">Start by selecting a category and uploading files.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Image Preview Modal */}
        {previewFile && (
          <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
            <DialogContent className="sm:max-w-[800px]">
              <DialogHeader>
                <DialogTitle>Image Preview</DialogTitle>
              </DialogHeader>
              <div className="flex justify-center">
                <img 
                  src={previewFile.url} 
                  alt="Preview" 
                  className="max-w-full max-h-[70vh] object-contain rounded"
                  onLoad={() => URL.revokeObjectURL(previewFile.url)}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}