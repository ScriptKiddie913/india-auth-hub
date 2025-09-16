import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palmtree, MapPin, Star, Users, ArrowRight } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-8 shadow-xl">
            <Palmtree className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-6 animate-fade-in">
            Incredible India
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed">
            Discover the magic, heritage, and diversity of India. 
            Your journey to unforgettable experiences starts here.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/signup">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                Start Your Journey
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            
            <Link to="/signin">
              <Button 
                variant="outline" 
                size="lg"
                className="px-8 py-6 text-lg border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all duration-300"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <Card className="text-center hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">28 States</CardTitle>
              <CardDescription className="text-lg">
                Explore diverse destinations across India
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="text-center hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-accent to-primary rounded-full flex items-center justify-center mb-4">
                <Star className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">1000+ Experiences</CardTitle>
              <CardDescription className="text-lg">
                From heritage tours to adventure activities
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="text-center hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">50M+ Travelers</CardTitle>
              <CardDescription className="text-lg">
                Join millions who've discovered India
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
