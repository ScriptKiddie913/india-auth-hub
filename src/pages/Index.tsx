import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Palmtree,
  MapPin,
  Star,
  Users,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  ThumbsUp,
  ShieldAlert,          // <-- new import
} from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen relative">
      {/* Background Image */}
      <img
        src="/image/pic2.jpg"
        alt="Incredible India"
        className="absolute inset-0 w-full h-full object-cover opacity-90 -z-10"
      />
      <div className="absolute inset-0 bg-black/40 -z-10" /> {/* overlay */}

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 md:py-20 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <div className="mx-auto w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-6 md:mb-8 shadow-xl">
            <Palmtree className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-4 md:mb-6 animate-fade-in leading-tight">
            Incredible India
          </h1>

          <p className="text-base sm:text-lg md:text-2xl text-white/90 mb-6 md:mb-8 leading-relaxed px-2">
            Discover the magic, heritage, and diversity of India. Your journey to unforgettable experiences starts here.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center items-center">
            <Link to="/signup" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                Start Your Journey
                <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </Link>

            <Link to="/signin" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-lg border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all duration-300"
              >
                Sign In
              </Button>
            </Link>
          </div>

          {/* Admin & Police Access */}
          <div className="mt-6 md:mt-8 flex flex-wrap gap-2 justify-center">
            <Link to="/admin">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300"
              >
                Admin Access
              </Button>
            </Link>

            <Link to="/police">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300 flex items-center"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Police Access
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 mt-12 md:mt-20">
          {/* ... existing cards unchanged ... */}
          <Card className="text-center hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <div className="mx-auto w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-3 md:mb-4">
                <MapPin className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <CardTitle className="text-lg md:text-2xl font-bold">28 States</CardTitle>
              <CardDescription className="text-sm md:text-lg">
                Explore diverse destinations across India
              </CardDescription>
            </CardHeader>
          </Card>

          {/* ... rest of the cards ... */}
        </div>

        {/* Trust & Safety Section */}
        <div className="mt-16 md:mt-24 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-8">
            Your Safety, Our Priority
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            {/* ... existing trust cards ... */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
