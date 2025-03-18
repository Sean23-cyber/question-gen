FROM node:18

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set up the Node.js app
WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .

# Expose ports
EXPOSE 8080 11434

# Start Ollama and the Node.js app
CMD ollama serve & node server.js
