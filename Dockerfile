# Use the official Node.js image as the base
FROM node:18

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json .
COPY package-lock.json .

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose ports
# - 8080 for your Node.js app
# - 11434 for Ollama
EXPOSE 8080 11434

# Start Ollama and the Node.js app
CMD ollama serve & node server.js
