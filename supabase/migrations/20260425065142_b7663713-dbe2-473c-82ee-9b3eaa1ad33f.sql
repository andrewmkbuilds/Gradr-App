ALTER POLICY "Users can delete their own job matches" ON public.job_matches TO authenticated;
ALTER POLICY "Users can update their own job matches" ON public.job_matches TO authenticated;
ALTER POLICY "Users can view their own job matches" ON public.job_matches TO authenticated;

ALTER POLICY "own reminders delete" ON public.job_reminders TO authenticated;
ALTER POLICY "own reminders select" ON public.job_reminders TO authenticated;
ALTER POLICY "own reminders update" ON public.job_reminders TO authenticated;

ALTER POLICY "Users can update their own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can view their own profile" ON public.profiles TO authenticated;

ALTER POLICY "Users can delete their own resumes" ON public.resumes TO authenticated;
ALTER POLICY "Users can update their own resumes" ON public.resumes TO authenticated;
ALTER POLICY "Users can view their own resumes" ON public.resumes TO authenticated;

ALTER POLICY "own jobs delete" ON public.tracked_jobs TO authenticated;
ALTER POLICY "own jobs select" ON public.tracked_jobs TO authenticated;
ALTER POLICY "own jobs update" ON public.tracked_jobs TO authenticated;

ALTER POLICY "own prefs delete" ON public.user_preferences TO authenticated;
ALTER POLICY "own prefs select" ON public.user_preferences TO authenticated;
ALTER POLICY "own prefs update" ON public.user_preferences TO authenticated;

ALTER POLICY "Users can delete their own resumes" ON storage.objects TO authenticated;
ALTER POLICY "Users can update their own resumes" ON storage.objects TO authenticated;
ALTER POLICY "Users can view their own resumes" ON storage.objects TO authenticated;