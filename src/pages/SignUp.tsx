const handleSignUp = async (e: React.FormEvent) => {
  e.preventDefault();

  // Password strength validation
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;

  if (!strongPasswordRegex.test(formData.password)) {
    toast({
      title: "Weak password",
      description:
        "Password must be at least 12 characters long and include uppercase, lowercase, numbers, and special symbols.",
      variant: "destructive",
    });
    return;
  }

  if (formData.password !== formData.confirmPassword) {
    toast({
      title: "Password mismatch",
      description: "Passwords do not match",
      variant: "destructive",
    });
    return;
  }

  if (!acceptTerms) {
    toast({
      title: "Accept terms",
      description: "Please accept the terms and conditions",
      variant: "destructive",
    });
    return;
  }

  setLoading(true);

  try {
    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
        },
      },
    });

    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Check your email!",
        description: "We've sent you a verification link to complete your registration.",
      });
      navigate("/signin");
    }
  } catch (error) {
    toast({
      title: "Error",
      description: "An unexpected error occurred",
      variant: "destructive",
    });
  } finally {
    setLoading(false);
  }
};
