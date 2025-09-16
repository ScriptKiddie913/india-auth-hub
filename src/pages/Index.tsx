import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, AlertTriangle, ShieldCheck } from "lucide-react";

const Index = () => {
  return (
    <div className="relative min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/image/pic.jpg')" }}>
      <div className="absolute inset-0 bg-black/40" /> {/* Dark overlay for readability */}

      {/* Hero Section */}
      <div className="relative container mx-auto px-4 py-20 text-center text-white">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Your Safety is Our <span className="text-blue-400">Priority</span>
        </h1>
        <p className="text-lg md:text-xl max-w-3xl mx-auto mb-10 leading-relaxed">
          Advanced real-time monitoring and alert system designed to keep tourists safe during their travels. 
          Register, track, and stay connected with emergency services.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link to="/signup">
            <Button 
              size="lg" 
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-6 text-lg shadow-lg transition-transform duration-300 hover:scale-105"
            >
              Register as Tourist
            </Button>
          </Link>

          <Link to="/dashboard">
            <Button 
              size="lg" 
              variant="outline" 
              className="bg-white text-gray-900 px-8 py-6 text-lg border-2 border-white hover:bg-gray-100 transition-all duration-300"
            >
              View Safety Dashboard
            </Button>
          </Link>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <Card className="text-center bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl font-bold">Real-time Tracking</CardTitle>
              <CardDescription>
                GPS-based location monitoring with instant emergency response capabilities
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl font-bold">Smart Alerts</CardTitle>
              <CardDescription>
                Instant notifications for weather, safety zones, and emergency situations
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center bg-white/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl font-bold">24/7 Support</CardTitle>
              <CardDescription>
                Round-the-clock emergency assistance and safety support services
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
