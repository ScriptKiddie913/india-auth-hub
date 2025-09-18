import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, FileText, Phone, MapPin } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
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
    if (!validateForm()) return;

    setLoading(true);
    console.log('Starting profile update...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      console.log('User found:', user.id);

      // Update user profile
      const profileData = {
        user_id: user.id,
        full_name: formData.name,
        phone: formData.phone,
        nationality: formData.nationality,
        passport_number: formData.passport || null,
        aadhaar_number: formData.aadhaar || null,
        email: formData.email
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
            Please provide your personal information & KYC details
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
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

          <div className="flex gap-4">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-primary to-accent"
            >
              {loading ? 'Processing...' : 'Complete Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileCompletion;
