$(function() {
	// config
	var captureIntervalTime = 100;	// time between captures, in ms
	var considerTime = 2000;		// time window to consider best capture, in ms
	var chillTime = 2000;			// time to chill after committing, in ms
	var captureWidth = 640;
	var captureHeight = 480;
	var diffWidth = 64;
	var diffHeight = 48;
	var pixelDiffThreshold = 16;	// min for a pixel to be considered significant
	var scoreThreshold = 4;			// min for an image to be considered significant

	// shared
	var captureInterval;
	var isConsidering = false;		// currently considering best capture?
	var isChilling = false;			// currently chilling after committing?
	var oldImage;					// previous captured image to compare against
	var bestDiff;					// most significant diff while considering

	var video, captureCanvas, captureContext, diffCanvas, diffContext,
		motionCanvas, motionContext;

	var $toggle = $('.toggle');
	var $history = $('.history');

	var $historyItemTemplate = $('#history-item-template');

	function init() {
		video = $('.video')[0];

		// create canvas for captures in memory
		captureCanvas = document.createElement('canvas');
		captureCanvas.width = captureWidth;
		captureCanvas.height = captureHeight;
		captureContext = captureCanvas.getContext('2d');

		// create canvas for diffing in memory
		diffCanvas = document.createElement('canvas');
		diffCanvas.width = diffWidth;
		diffCanvas.height = diffHeight;
		diffContext = diffCanvas.getContext('2d');
		diffContext.globalCompositeOperation = 'difference';

		// set up canvas on page for showing motion
		motionCanvas = $('.motion')[0];
		motionCanvas.width = diffWidth;
		motionCanvas.height = diffHeight;
		motionContext = motionCanvas.getContext('2d');

		$toggle.on('click', toggleStreaming);
	}

	function toggleStreaming() {
		if (video.srcObject && video.srcObject.active) {
			// stream exists, kill it
			stopStreaming();
		} else {
			// stream doesn't exist, attempt to start
			requestCam();
		}
	}

	function requestCam() {
		var constraints = {
			audio: false,
			video: { width: captureWidth, height: captureHeight }
		};

		navigator.mediaDevices.getUserMedia(constraints)
			.then(startStreaming)
			.catch(displayError);
	}

	function startStreaming(stream) {
		video.srcObject = stream;
		captureInterval = setInterval(capture, captureIntervalTime);
		$toggle.text('Stop');
	}

	function stopStreaming() {
		video.srcObject.getVideoTracks()[0].stop();
		clearInterval(captureInterval);
		$toggle.text('Start');
	}

	function displayError(error) {
		console.log(error);
		$toggle
			.text('Denied')
			.prop('disabled', true);
	}

	function capture() {
		// capture from video
		captureContext.drawImage(video, 0, 0, captureWidth, captureHeight);

		// create as image
		var newImage = new Image();
		newImage.onload = checkImage;
		newImage.src = captureCanvas.toDataURL();
	}

	function checkImage() {
		var newImage = this;
		if (oldImage) {
			var diff = calculateDiff(oldImage, newImage);

			// show motion on page
			motionContext.putImageData(diff.imageData, 0, 0);

			if (!isChilling) {
				saveBest(diff);
			}
		}
		oldImage = newImage;
	}

	function calculateDiff(oldImage, newImage) {
		// clear canvas and draw both images
		diffContext.clearRect(0, 0, diffWidth, diffHeight);
		diffContext.drawImage(oldImage, 0, 0, diffWidth, diffHeight);
		diffContext.drawImage(newImage, 0, 0, diffWidth, diffHeight);

		// get pixel data
		var imageData = diffContext.getImageData(0, 0, diffWidth, diffHeight);
		var rgba = imageData.data;

		// score each pixel, adjust color for display
		var score = 0;
		for (var i = 0; i < rgba.length; i += 4) {
			var pixelDiff = rgba[i] * 0.3 + rgba[i + 1] * 0.6 + rgba[i + 2] * 0.1;
			var normalized = Math.min(255, pixelDiff * (255 / pixelDiffThreshold));
			rgba[i] = 0;
			rgba[i + 1] = normalized;
			rgba[i + 2] = 0;

			if (pixelDiff >= pixelDiffThreshold) {
				score++;
			}
		}

		return {
			newImage: newImage,
			imageData: imageData,
			score: score
		};
	}

	function saveBest(diff) {
		if (isConsidering) {
			if (diff.score > bestDiff.score) {
				// this is the new best diff for this consideration time window
				bestDiff = diff;
			}
		} else {
			if (diff.score > scoreThreshold) {
				// this diff is good enough to start a consideration time window
				bestDiff = diff;
				isConsidering = true;
				setTimeout(stopConsidering, considerTime);
			}
		}
	}

	function stopConsidering() {
		isConsidering = false;
		commit(bestDiff);

		bestDiff = undefined;
		isChilling = true;
		setTimeout(stopChilling, chillTime);
	}

	function stopChilling() {
		isChilling = false;
	}

	function commit(diff) {
		// prep values
		var src = diff.newImage.src;
		var time = new Date().toLocaleTimeString();
		var caption = time.toLowerCase() + ' (score: ' + diff.score + ')';

		// load html from template
		var html = $historyItemTemplate.html();
		var $newHistoryItem = $(html);

		// set values and add to page
		$newHistoryItem.find('img').attr('src', src);
		$newHistoryItem.find('figcaption').text(caption);
		$history.prepend($newHistoryItem);

		// TODO: and then upload
	}

	// kick things off
	init();
});
