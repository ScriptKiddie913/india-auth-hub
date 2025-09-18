import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Mail, MapPin, FileText, ArrowLeft, Edit } from "lucide-react";

interface ProfileData {
  full_name: string;
  phone: string | null;
  nationality: string | null;
  passport_number: string | null;
  aadhaar_number: string | null;
  document_url: string | null;
  created_at: string;
}

const Profile = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        navigate('/signin');
        return;
      }

      setUser(authUser);

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('full_name, phone, nationality, passport_number, aadhaar_number, document_url, created_at')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!profileData) {
        navigate('/profile-completion');
        return;
      }

      setProfile(profileData);
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast({
        title: "Error loading profile",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10">
        <Card className="w-full max-w-md text-center p-8">
          <CardContent>
            <User className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Profile Not Found</h2>
            <p className="text-muted-foreground mb-6">Please complete your profile setup</p>
            <Button onClick={() => navigate('/profile-completion')}>
              Complete Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <Badge variant="outline">Profile Verified</Badge>
        </div>

        {/* Profile Header */}
        <Card className="bg-gradient-to-r from-primary to-accent text-white border-0 shadow-xl">
          <CardContent className="p-8">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-12 h-12 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">{profile.full_name}</h1>
                <p className="text-white/80 text-lg mb-4">{user?.email}</p>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {profile.nationality}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {profile.phone}
                  </div>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => navigate('/profile-completion')}
                className="flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Tabs defaultValue="personal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="personal">Personal Information</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                      <p className="text-lg font-medium">{profile.full_name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                      <p className="text-lg font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {user?.email}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                      <p className="text-lg font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {profile.phone}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nationality</label>
                      <p className="text-lg font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {profile.nationality}
                      </p>
                    </div>
                    {profile.passport_number && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Passport Number</label>
                        <p className="text-lg font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          {profile.passport_number}
                        </p>
                      </div>
                    )}
                    {profile.aadhaar_number && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Aadhaar Number</label>
                        <p className="text-lg font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          {profile.aadhaar_number}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                      <p className="text-lg font-medium">
                        {new Date(profile.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Uploaded Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profile.document_url ? (
                  <div className="border rounded-lg p-6 text-center">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Identity Document</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {profile.nationality === 'Indian' ? 'Aadhaar Card' : 'Passport'} - Verified
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => window.open(profile.document_url!, '_blank')}
                    >
                      View Document
                    </Button>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-6 text-center">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Document Uploaded</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload your identity document for verification
                    </p>
                    <Button onClick={() => navigate('/profile-completion')}>
                      Upload Document
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;