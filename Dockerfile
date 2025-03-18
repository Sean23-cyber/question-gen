# Use the official Node.js image as the base
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first (for efficient caching)
COPY package.json package-lock.json . 

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the necessary port for the Node.js app
EXPOSE 8080

# Start the Node.js app
CMD ["node", "server.js"]
