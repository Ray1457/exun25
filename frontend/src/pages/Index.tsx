// Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      style={{
        backgroundImage: 'url("/bg.png"), url("#file:bg.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Welcome to Your Blank App</h1>
        <p className="text-xl text-muted-foreground">Start building your amazing project here!</p>
      </div>
    </div>
  );
};

export default Index;
