import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, FileText, Phone, MapPin, Upload, CheckCircle } from "lucide-react";

interface FormData {
  name: string;
  nationality: string;
  passport: string;
  aadhaar: string;
  phone: string;
  email: string;
}

const ProfileCompletion = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    nationality: '',
    passport: '',
    aadhaar: '',
    phone: '',
    email: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a .jpg, .jpeg, .png, or .pdf file",
          variant: "destructive"
        });
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 5MB",
          variant: "destructive"
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const validateStep1 = () => {
    if (!formData.name || !formData.nationality || !formData.phone || !formData.email) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return false;
    }

    if (formData.nationality === 'Indian' && !formData.aadhaar) {
      toast({
        title: "Aadhaar required",
        description: "Aadhaar number is required for Indian citizens",
        variant: "destructive"
      });
      return false;
    }

    if (!formData.passport && formData.nationality !== 'Indian') {
      toast({
        title: "Passport required",
        description: "Passport number is required for non-Indian citizens",
        variant: "destructive"
      });
      return false;
    }

    // Validate phone number format
    const phoneRegex = /^[+]?[\d\s\-()]{10,15}$/;
    if (!phoneRegex.test(formData.phone)) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number",
        variant: "destructive"
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2);
      }
      return;
    }

    if (!selectedFile) {
      toast({
        title: "Document required",
        description: "Please upload your passport or Aadhaar document",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    console.log('Starting document upload process...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      console.log('User found:', user.id);
      console.log('Selected file:', selectedFile.name, selectedFile.size, selectedFile.type);

      // Upload document to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      
      console.log('Uploading file as:', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('helpdesk-files')
        .upload(`user-documents/${fileName}`, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL for the uploaded document
      const { data: { publicUrl } } = supabase.storage
        .from('helpdesk-files')
        .getPublicUrl(`user-documents/${fileName}`);

      console.log('Public URL:', publicUrl);

      // Update user profile
      const profileData = {
        user_id: user.id,
        full_name: formData.name,
        phone: formData.phone,
        nationality: formData.nationality,
        passport_number: formData.passport || null,
        aadhaar_number: formData.aadhaar || null,
        document_url: publicUrl
      };

      console.log('Updating profile with:', profileData);

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData, {
          onConflict: 'user_id'
        });

      if (profileError) {
        console.error('Profile update error:', profileError);
        throw profileError;
      }

      console.log('Profile updated successfully');

      toast({
        title: "Profile completed!",
        description: "Your profile has been successfully updated. You can now access the dashboard.",
      });

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error completing profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to complete profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Complete Your Profile
          </CardTitle>
          <p className="text-muted-foreground mt-2">
            Step {currentStep} of 2: {currentStep === 1 ? 'Personal Information & KYC Verification' : 'Document Upload'}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter your full name as per passport/Aadhaar"
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Nationality */}
              <div className="space-y-2">
                <Label>Nationality *</Label>
                <Select onValueChange={(value) => handleInputChange('nationality', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your nationality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Indian">Indian</SelectItem>
                    <SelectItem value="American">American</SelectItem>
                    <SelectItem value="British">British</SelectItem>
                    <SelectItem value="German">German</SelectItem>
                    <SelectItem value="French">French</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Passport Number */}
              {formData.nationality !== 'Indian' && (
                <div className="space-y-2">
                  <Label htmlFor="passport">Passport Number *</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="passport"
                      value={formData.passport}
                      onChange={(e) => handleInputChange('passport', e.target.value)}
                      placeholder="Enter your passport number"
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {/* Aadhaar Number (for Indian citizens) */}
              {formData.nationality === 'Indian' && (
                <div className="space-y-2">
                  <Label htmlFor="aadhaar">Aadhaar Number *</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="aadhaar"
                      value={formData.aadhaar}
                      onChange={(e) => handleInputChange('aadhaar', e.target.value)}
                      placeholder="Enter your 12-digit Aadhaar number"
                      className="pl-10"
                      maxLength={12}
                    />
                  </div>
                </div>
              )}

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="+91 9876543210"
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="your.email@example.com"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="text-center p-6 border-2 border-dashed border-muted rounded-lg">
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload Identity Document</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a clear copy of your {formData.nationality === 'Indian' ? 'Aadhaar card' : 'passport'}
                </p>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="document-upload"
                />
                <label htmlFor="document-upload">
                  <Button variant="outline" className="cursor-pointer" type="button">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose File
                  </Button>
                </label>
                {selectedFile && (
                  <div className="mt-4 p-3 bg-green-50 rounded-md flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                  </div>
                )}
              </div>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Accepted formats: JPG, JPEG, PNG, PDF</p>
                <p>• Maximum file size: 5MB</p>
                <p>• Ensure the document is clear and all details are visible</p>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            {currentStep === 2 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="flex-1"
              >
                Back
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-primary to-accent"
            >
              {loading ? 'Processing...' : currentStep === 1 ? 'Continue' : 'Complete Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileCompletion;